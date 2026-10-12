// Mesas con estado (Libre / Ocupada) y consumos acumulados en una cuenta abierta hasta el cierre.
const { query, tx } = require('./db');
const { audit } = require('./audit');
const { HttpError } = require('./http');
const ventas = require('./ventas');

const N = Number;

async function mesaDe(t, id) {
  const m = (await t.query('SELECT id_mesa, numero, estado FROM mesas WHERE id_mesa=$1', [id])).rows[0];
  if (!m) throw new HttpError(404, 'No encontrado');
  return m;
}
const abiertaDe = async (t, id) => (await t.query("SELECT cu.*, c.nombre AS cliente FROM cuentas cu LEFT JOIN clientes c ON c.id_cliente=cu.id_cliente WHERE cu.id_mesa=$1 AND cu.estado='Abierta' ORDER BY cu.id_cuenta DESC LIMIT 1", [id])).rows[0];
const entero = (v, min = 1) => { const n = Number(v); if (!Number.isInteger(n) || n < min) throw new HttpError(400, 'Cantidad no válida'); return n; };

async function clienteValido(t, id) {
  if (id === undefined || id === null || id === '') return null;
  const c = (await t.query('SELECT id_cliente FROM clientes WHERE id_cliente=$1', [Number(id)])).rows[0];
  if (!c) throw new HttpError(400, 'Cliente no válido');
  return c.id_cliente;
}

/** Unidades de un producto ya comprometidas en cuentas abiertas (se descuentan del stock al cerrar). */
const reservado = async (t, idp) => N((await t.query("SELECT COALESCE(SUM(d.cantidad),0) AS n FROM detalle_cuenta d JOIN cuentas cu ON cu.id_cuenta=d.id_cuenta WHERE cu.estado='Abierta' AND d.id_producto=$1", [idp])).rows[0].n);

async function verificarStock(t, idp, extra, nombre, stock) {
  const libre = stock - await reservado(t, idp);
  if (libre < extra) throw new HttpError(409, `Sin existencias de ${nombre} (disponibles: ${Math.max(libre, 0)})`);
}

async function tablero() {
  const r = await query("SELECT m.id_mesa, m.numero, m.estado, cu.id_cuenta, cu.id_cliente, c.nombre AS cliente, cu.fecha_apertura, (SELECT COALESCE(SUM(d.subtotal),0) FROM detalle_cuenta d WHERE d.id_cuenta=cu.id_cuenta) AS total, (SELECT COALESCE(SUM(d.cantidad),0) FROM detalle_cuenta d WHERE d.id_cuenta=cu.id_cuenta) AS items FROM mesas m LEFT JOIN cuentas cu ON cu.id_mesa=m.id_mesa AND cu.estado='Abierta' LEFT JOIN clientes c ON c.id_cliente=cu.id_cliente ORDER BY m.numero");
  return { data: r.rows.map((x) => ({ id_mesa: x.id_mesa, numero: x.numero, estado: x.estado, cuenta: x.id_cuenta ? { id_cuenta: x.id_cuenta, id_cliente: x.id_cliente, cliente: x.cliente, abierta: x.fecha_apertura, total: N(x.total), items: N(x.items) } : null })) };
}

async function consumos(id) {
  const t = { query };
  const mesa = await mesaDe(t, id); const cuenta = await abiertaDe(t, id);
  if (!cuenta) return { mesa, cuenta: null, consumos: [], porCliente: [], total: 0 };
  const rows = (await query('SELECT d.id_detalle, d.id_producto, p.nombre AS producto, d.id_cliente, c.nombre AS cliente, d.cantidad, d.precio_unitario, d.subtotal FROM detalle_cuenta d JOIN productos p ON p.id_producto=d.id_producto LEFT JOIN clientes c ON c.id_cliente=d.id_cliente WHERE d.id_cuenta=$1 ORDER BY d.id_detalle', [cuenta.id_cuenta])).rows
    .map((x) => ({ ...x, precio_unitario: N(x.precio_unitario), subtotal: N(x.subtotal) }));
  const por = {}; rows.forEach((x) => { const k = x.cliente || 'Sin asignar'; por[k] = (por[k] || 0) + x.subtotal; });
  return { mesa, cuenta: { id_cuenta: cuenta.id_cuenta, id_cliente: cuenta.id_cliente, cliente: cuenta.cliente, abierta: cuenta.fecha_apertura }, consumos: rows, porCliente: Object.entries(por).map(([cliente, total]) => ({ cliente, total })), total: rows.reduce((s, x) => s + x.subtotal, 0) };
}

async function ocupar(u, id, b) {
  const cu = await tx(async (t) => {
    const m = await mesaDe(t, id);
    if (m.estado === 'Ocupada' || await abiertaDe(t, id)) throw new HttpError(409, 'La mesa ya está ocupada');
    const idc = await clienteValido(t, b.id_cliente);
    const r = (await t.query("INSERT INTO cuentas (id_cliente, id_mesa, id_usuario, estado) VALUES ($1,$2,$3,'Abierta') RETURNING id_cuenta", [idc, id, u.sub])).rows[0];
    await t.query("UPDATE mesas SET estado='Ocupada' WHERE id_mesa=$1", [id]);
    return r;
  });
  await audit(u, `OCUPAR #${id}`, 'mesas');
  return { ...(await tablero()).data.find((x) => x.id_mesa === id), id_cuenta: cu.id_cuenta };
}

async function liberar(u, id) {
  await tx(async (t) => {
    await mesaDe(t, id); const cu = await abiertaDe(t, id);
    if (cu) {
      const n = N((await t.query('SELECT COUNT(*) AS n FROM detalle_cuenta WHERE id_cuenta=$1', [cu.id_cuenta])).rows[0].n);
      if (n > 0) throw new HttpError(409, 'La mesa tiene consumos: ciérrela para cobrar');
      await t.query("UPDATE cuentas SET estado='Cancelada', fecha_cierre=now() WHERE id_cuenta=$1", [cu.id_cuenta]);
    }
    await t.query("UPDATE mesas SET estado='Libre' WHERE id_mesa=$1", [id]);
  });
  await audit(u, `LIBERAR #${id}`, 'mesas');
  return (await tablero()).data.find((x) => x.id_mesa === id);
}

async function agregar(u, id, b) {
  const idl = await tx(async (t) => {
    await mesaDe(t, id); const cu = await abiertaDe(t, id);
    if (!cu) throw new HttpError(409, 'La mesa no está ocupada');
    const cant = b.cantidad === undefined ? 1 : entero(b.cantidad);
    const p = (await t.query('SELECT nombre, precio_venta, stock_actual, estado FROM productos WHERE id_producto=$1', [b.id_producto])).rows[0];
    if (!p || !p.estado) throw new HttpError(400, 'Producto no válido');
    const idc = (await clienteValido(t, b.id_cliente)) ?? cu.id_cliente ?? null;
    await verificarStock(t, b.id_producto, cant, p.nombre, p.stock_actual);
    const ex = (await t.query('SELECT id_detalle, cantidad, precio_unitario FROM detalle_cuenta WHERE id_cuenta=$1 AND id_producto=$2 AND id_cliente IS NOT DISTINCT FROM $3', [cu.id_cuenta, b.id_producto, idc])).rows[0];
    if (ex) { await t.query('UPDATE detalle_cuenta SET cantidad=$1, subtotal=$2 WHERE id_detalle=$3', [ex.cantidad + cant, (ex.cantidad + cant) * N(ex.precio_unitario), ex.id_detalle]); return ex.id_detalle; }
    return (await t.query('INSERT INTO detalle_cuenta (id_cuenta, id_producto, id_cliente, cantidad, precio_unitario, subtotal) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_detalle', [cu.id_cuenta, b.id_producto, idc, cant, N(p.precio_venta), cant * N(p.precio_venta)])).rows[0].id_detalle;
  });
  await audit(u, `CONSUMO #${idl}`, 'detalle_cuenta');
  return consumos(id);
}

async function lineaDe(t, id, idd) {
  const cu = await abiertaDe(t, id);
  if (!cu) throw new HttpError(409, 'La mesa no está ocupada');
  const l = (await t.query('SELECT d.*, p.nombre, p.stock_actual FROM detalle_cuenta d JOIN productos p ON p.id_producto=d.id_producto WHERE d.id_detalle=$1 AND d.id_cuenta=$2', [idd, cu.id_cuenta])).rows[0];
  if (!l) throw new HttpError(404, 'No encontrado');
  return l;
}

async function cambiar(u, id, idd, b) {
  await tx(async (t) => {
    await mesaDe(t, id); const l = await lineaDe(t, id, idd); const cant = entero(b.cantidad);
    if (cant > l.cantidad) await verificarStock(t, l.id_producto, cant - l.cantidad, l.nombre, l.stock_actual);
    await t.query('UPDATE detalle_cuenta SET cantidad=$1, subtotal=$2 WHERE id_detalle=$3', [cant, cant * N(l.precio_unitario), idd]);
  });
  await audit(u, `CONSUMO #${idd}`, 'detalle_cuenta');
  return consumos(id);
}

async function quitar(u, id, idd) {
  await tx(async (t) => { await mesaDe(t, id); await lineaDe(t, id, idd); await t.query('DELETE FROM detalle_cuenta WHERE id_detalle=$1', [idd]); });
  await audit(u, `QUITAR CONSUMO #${idd}`, 'detalle_cuenta');
  return consumos(id);
}

/** Cierra la mesa: genera el comprobante con los consumos acumulados y la deja libre. */
async function cerrar(u, id, b) {
  const comp = await tx(async (t) => {
    const m = await mesaDe(t, id); const cu = await abiertaDe(t, id);
    if (!cu) throw new HttpError(409, 'La mesa no está ocupada');
    const lineas = (await t.query('SELECT id_producto, cantidad, precio_unitario FROM detalle_cuenta WHERE id_cuenta=$1 ORDER BY id_detalle', [cu.id_cuenta])).rows;
    if (!lineas.length) throw new HttpError(409, 'No hay consumos para cobrar; use "Marcar libre"');
    const c = await ventas.crearComprobante(t, u, { metodo: b.metodo, tipo: b.tipo, id_cliente: cu.id_cliente, cliente_nombre: cu.cliente || `Mesa ${m.numero}`, items: lineas.map((l) => ({ tipo: 'consumo', id_producto: l.id_producto, cantidad: l.cantidad, precio_unitario: N(l.precio_unitario) })) }, { fijos: true });
    await t.query("UPDATE cuentas SET estado='Cerrada', fecha_cierre=now(), total=$1, id_comprobante=$2 WHERE id_cuenta=$3", [c.total, c.id_comprobante, cu.id_cuenta]);
    await t.query("UPDATE mesas SET estado='Libre' WHERE id_mesa=$1", [id]);
    return c;
  });
  await audit(u, `CERRAR MESA #${id}`, 'mesas'); await audit(u, `INSERT #${comp.id_comprobante}`, 'comprobantes');
  return ventas.conItems(comp.id_comprobante);
}

module.exports = { tablero, consumos, ocupar, liberar, agregar, cambiar, quitar, cerrar };
