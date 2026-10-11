const { query, tx } = require('./db');
const { audit } = require('./audit');
const { HttpError } = require('./http');
const wa = require('./whatsapp');

const METODOS = ['Efectivo', 'Transferencia', 'Tarjeta', 'QR'];
const N = (v) => Number(v);

/** Crea un comprobante (tirilla o factura) con sus ítems; descuenta inventario y aplica promociones. */
async function crearComprobante(t, u, d) {
  if (!METODOS.includes(d.metodo)) throw new HttpError(400, 'Método de pago no válido');
  if (!Array.isArray(d.items) || !d.items.length) throw new HttpError(400, 'Agregue al menos un servicio o consumo');
  const lineas = [];
  for (const it of d.items) {
    const cant = Number.isInteger(it.cantidad) ? it.cantidad : parseInt(it.cantidad, 10);
    if (!(cant >= 1)) throw new HttpError(400, 'Cantidad no válida');
    let desc = String(it.descripcion || '').trim(); let precio = N(it.precio_unitario); let idp = null;
    if (it.tipo === 'consumo') {
      const p = (await t.query('SELECT nombre, precio_venta, stock_actual, estado FROM productos WHERE id_producto=$1', [it.id_producto])).rows[0];
      if (!p || !p.estado) throw new HttpError(400, 'Producto no válido');
      if (p.stock_actual < cant) throw new HttpError(409, `Sin existencias de ${p.nombre}`);
      desc = p.nombre; precio = N(p.precio_venta); idp = it.id_producto;
    } else if (it.tipo === 'cancha') {
      const c = (await t.query('SELECT nombre, tarifa_hora FROM canchas WHERE id_cancha=$1', [it.id_cancha])).rows[0];
      if (!c) throw new HttpError(400, 'Cancha no válida');
      if (!(precio >= 0)) precio = N(c.tarifa_hora);
      desc = desc || `${c.nombre} (${cant} h)`;
    } else if (it.tipo === 'mesa' || it.tipo === 'otro') {
      if (!desc || !(precio >= 0)) throw new HttpError(400, 'Descripción y valor son obligatorios');
    } else throw new HttpError(400, 'Tipo de servicio no válido');
    const bruto = precio * cant; let dto = 0; let promo = null;
    if (it.id_promocion) {
      promo = (await t.query("SELECT id_promocion, tipo, valor FROM promociones WHERE id_promocion=$1 AND estado AND (fecha_inicio IS NULL OR fecha_inicio<=CURRENT_DATE) AND (fecha_fin IS NULL OR fecha_fin>=CURRENT_DATE)", [it.id_promocion])).rows[0];
      if (!promo) throw new HttpError(400, 'Promoción no vigente');
      dto = promo.tipo === 'Valor' ? Math.min(N(promo.valor), bruto) : Math.round(bruto * N(promo.valor) / 100);
    }
    lineas.push({ tipo: it.tipo, desc, idp, promo: promo && promo.id_promocion, cant, precio, dto, sub: bruto - dto, bruto });
  }
  const subtotal = lineas.reduce((s, l) => s + l.bruto, 0); const descuento = lineas.reduce((s, l) => s + l.dto, 0); const total = subtotal - descuento;
  const numero = N((await t.query('SELECT COALESCE(MAX(numero),0)+1 AS n FROM comprobantes')).rows[0].n);
  const c = (await t.query('INSERT INTO comprobantes (numero, tipo, id_cliente, cliente_nombre, metodo, subtotal, descuento, total, id_usuario, id_reserva) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
    [numero, d.tipo === 'Factura' ? 'Factura' : 'Tirilla', d.id_cliente || null, d.cliente_nombre || null, d.metodo, subtotal, descuento, total, u.sub, d.id_reserva || null])).rows[0];
  for (const l of lineas) {
    await t.query('INSERT INTO comprobante_items (id_comprobante, tipo, descripcion, id_producto, id_promocion, cantidad, precio_unitario, descuento, subtotal) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [c.id_comprobante, l.tipo, l.desc, l.idp, l.promo, l.cant, l.precio, l.dto, l.sub]);
    if (l.idp) {
      await t.query('UPDATE productos SET stock_actual=stock_actual-$1 WHERE id_producto=$2', [l.cant, l.idp]);
      await t.query("INSERT INTO movimientos_inventario (id_producto, tipo, cantidad, id_usuario, referencia) VALUES ($1,'Salida',$2,$3,$4)", [l.idp, l.cant, u.sub, `Comprobante ${numero}`]);
    }
  }
  return c;
}

async function conItems(id) {
  const c = (await query('SELECT * FROM comprobantes WHERE id_comprobante=$1', [id])).rows[0];
  if (!c) return null;
  c.items = (await query('SELECT tipo, descripcion, cantidad, precio_unitario, descuento, subtotal FROM comprobante_items WHERE id_comprobante=$1 ORDER BY id_item', [id])).rows;
  return c;
}

/** Progreso de fidelización: la reserva número 8 de cada ciclo de 8 es gratis (7 pagadas seguidas). */
async function fidelizacion(id) {
  const n = N((await query("SELECT COUNT(*) AS n FROM reservas WHERE id_cliente=$1 AND estado<>'Cancelada'", [id])).rows[0].n);
  const ciclo = n % 8;
  return { reservas: n, progreso: Math.min(ciclo, 7), proxima_gratis: (n + 1) % 8 === 0, faltan: ciclo >= 7 ? 0 : 7 - ciclo };
}

/** Flujo completo: cliente por celular, reserva, tirilla y recordatorio por WhatsApp. */
async function reservaRapida(u, b) {
  if (!String(b.nombre || '').trim() || !wa.telefono(b.telefono)) throw new HttpError(400, 'Nombre y celular válidos son obligatorios');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha) || !/^\d{2}:\d{2}$/.test(b.hora_inicio) || !/^\d{2}:\d{2}$/.test(b.hora_fin) || b.hora_fin <= b.hora_inicio) throw new HttpError(400, 'Fecha u horario no válidos');
  const horas = ((+b.hora_fin.slice(0, 2)) * 60 + (+b.hora_fin.slice(3)) - (+b.hora_inicio.slice(0, 2)) * 60 - (+b.hora_inicio.slice(3))) / 60;
  const out = await tx(async (t) => {
    const cancha = (await t.query('SELECT nombre, tarifa_hora FROM canchas WHERE id_cancha=$1', [b.id_cancha])).rows[0];
    if (!cancha) throw new HttpError(400, 'Cancha no válida');
    const choque = (await t.query("SELECT 1 FROM reservas WHERE id_cancha=$1 AND fecha=$2 AND estado<>'Cancelada' AND hora_inicio < $4 AND hora_fin > $3", [b.id_cancha, b.fecha, b.hora_inicio, b.hora_fin])).rows.length;
    if (choque) throw new HttpError(409, 'La cancha ya está reservada en ese horario');
    let cli = (await t.query('SELECT id_cliente, nombre FROM clientes WHERE telefono=$1', [String(b.telefono).replace(/\D/g, '')])).rows[0];
    if (!cli) cli = (await t.query('INSERT INTO clientes (nombre, telefono) VALUES ($1,$2) RETURNING id_cliente, nombre', [String(b.nombre).trim(), String(b.telefono).replace(/\D/g, '')])).rows[0];
    const previas = N((await t.query("SELECT COUNT(*) AS n FROM reservas WHERE id_cliente=$1 AND estado<>'Cancelada'", [cli.id_cliente])).rows[0].n);
    const gratis = (previas + 1) % 8 === 0;
    const valor = gratis ? 0 : N(cancha.tarifa_hora) * horas;
    const r = (await t.query("INSERT INTO reservas (id_cancha, id_cliente, fecha, hora_inicio, hora_fin, estado, valor) VALUES ($1,$2,$3,$4,$5,'Reservada',$6) RETURNING *", [b.id_cancha, cli.id_cliente, b.fecha, b.hora_inicio, b.hora_fin, valor])).rows[0];
    const metodo = METODOS.includes(b.metodo) ? b.metodo : 'Efectivo';
    const desc = `${cancha.nombre} (${horas} h)${gratis ? ' - reserva gratis por fidelización' : ''}`;
    const comp = await crearComprobante(t, u, { metodo, tipo: b.tipo, id_cliente: cli.id_cliente, cliente_nombre: cli.nombre, id_reserva: r.id_reserva, items: [{ tipo: 'otro', descripcion: desc, precio_unitario: valor, cantidad: 1 }] });
    return { reserva: r, comprobante: comp, cliente: cli, cancha, gratis, metodo };
  });
  const neg = (await query('SELECT nombre FROM negocio WHERE id_negocio=1')).rows[0];
  const texto = wa.mensaje({ negocio: neg.nombre, cliente: out.cliente.nombre, cancha: out.cancha.nombre, fecha: b.fecha, hora: b.hora_inicio, metodo: out.metodo });
  const env = await wa.enviar(b.telefono, texto);
  await query('INSERT INTO notificaciones (id_reserva, telefono, mensaje, canal, estado) VALUES ($1,$2,$3,$4,$5)', [out.reserva.id_reserva, String(b.telefono).replace(/\D/g, ''), texto, env.canal, env.estado]);
  await audit(u, `INSERT #${out.reserva.id_reserva}`, 'reservas'); await audit(u, `INSERT #${out.comprobante.id_comprobante}`, 'comprobantes');
  return { reserva: out.reserva, comprobante: await conItems(out.comprobante.id_comprobante), notificacion: { ...env, mensaje: texto }, reserva_gratis: out.gratis };
}

async function recordatorio(u, idReserva) {
  const r = (await query('SELECT r.*, c.nombre AS cliente, c.telefono, ca.nombre AS cancha FROM reservas r JOIN clientes c ON c.id_cliente=r.id_cliente JOIN canchas ca ON ca.id_cancha=r.id_cancha WHERE r.id_reserva=$1', [idReserva])).rows[0];
  if (!r) throw new HttpError(404, 'No encontrado');
  const neg = (await query('SELECT nombre FROM negocio WHERE id_negocio=1')).rows[0];
  const pago = (await query('SELECT metodo FROM comprobantes WHERE id_reserva=$1 ORDER BY id_comprobante DESC LIMIT 1', [idReserva])).rows[0];
  const texto = wa.mensaje({ negocio: neg.nombre, cliente: r.cliente, cancha: r.cancha, fecha: String(r.fecha).slice(0, 10), hora: r.hora_inicio, metodo: pago ? pago.metodo : 'Por definir' });
  const env = await wa.enviar(r.telefono, texto);
  await query('INSERT INTO notificaciones (id_reserva, telefono, mensaje, canal, estado) VALUES ($1,$2,$3,$4,$5)', [idReserva, r.telefono, texto, env.canal, env.estado]);
  await audit(u, `RECORDATORIO #${idReserva}`, 'notificaciones');
  return { ...env, mensaje: texto };
}

async function historial(id) {
  const cli = (await query('SELECT id_cliente, nombre, telefono, correo, fecha_registro FROM clientes WHERE id_cliente=$1', [id])).rows[0];
  if (!cli) throw new HttpError(404, 'No encontrado');
  const reservas = (await query('SELECT r.id_reserva, r.fecha, r.hora_inicio, r.hora_fin, r.estado, r.valor, c.nombre AS cancha FROM reservas r JOIN canchas c ON c.id_cancha=r.id_cancha WHERE r.id_cliente=$1 ORDER BY r.fecha DESC, r.hora_inicio DESC LIMIT 50', [id])).rows;
  const compras = (await query('SELECT id_comprobante, numero, fecha, metodo, total FROM comprobantes WHERE id_cliente=$1 ORDER BY fecha DESC LIMIT 50', [id])).rows;
  const visitas = reservas.length + compras.length;
  return { cliente: cli, reservas, comprobantes: compras, visitas, frecuente: visitas >= 6, fidelizacion: await fidelizacion(id) };
}

module.exports = { crearComprobante, conItems, reservaRapida, recordatorio, historial, fidelizacion, METODOS };
