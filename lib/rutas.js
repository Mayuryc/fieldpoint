// Rutas especiales (más allá del CRUD genérico): negocio, comprobantes, reportes, auditoría, respaldo, licencia, QR.
const QRCode = require('qrcode');
const { query } = require('./db');
const { audit } = require('./audit');
const { send, sendBin, HttpError } = require('./http');
const ventas = require('./ventas');
const pdf = require('./pdf');
const reportes = require('./reportes');
const backup = require('./backup');
const mesas = require('./mesas');
const lic = require('./license');

const ADMIN = 'Administrador';
const necesita = (u, ...roles) => { if (!roles.includes(u.rol)) throw new HttpError(403, 'No tiene permiso para esta operación'); };
const negocio = async () => (await query('SELECT * FROM negocio WHERE id_negocio=1')).rows[0];
const lim = (sp, d = 50) => Math.min(Math.max(parseInt(sp.get('limit'), 10) || d, 1), 200);
let cache = { t: 0, ok: false };

async function licenciaActiva() {
  if (Date.now() - cache.t < 30000) return cache.ok;
  const l = (await query('SELECT clave FROM licencia WHERE id=1')).rows[0];
  cache = { t: Date.now(), ok: !!l && lic.verify(l.clave).ok };
  return cache.ok;
}

/** Devuelve true si la ruta fue atendida. */
async function atender_usuarios({ res, user, name, id, body, m }) {
  if (name === 'usuarios' && Number.isInteger(id) && (m === 'DELETE' || m === 'PUT')) {
    necesita(user, ADMIN);
    const objetivo = (await query('SELECT u.id_usuario, u.estado, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id_rol=u.id_rol WHERE u.id_usuario=$1', [id])).rows[0];
    if (!objetivo) throw new HttpError(404, 'No encontrado');
    const rolNuevo = m === 'PUT' && body.id_rol !== undefined ? (await query('SELECT nombre FROM roles WHERE id_rol=$1', [Number(body.id_rol)])).rows[0]?.nombre : objetivo.rol;
    const deja = m === 'DELETE' || body.estado === false || rolNuevo !== 'Administrador';
    if (id === user.sub && (m === 'DELETE' || body.estado === false)) throw new HttpError(409, 'No puede eliminar ni desactivar su propia cuenta');
    if (objetivo.rol === 'Administrador' && objetivo.estado && deja && Number((await query("SELECT COUNT(*) AS n FROM usuarios u JOIN roles r ON r.id_rol=u.id_rol WHERE r.nombre='Administrador' AND u.estado")).rows[0].n) <= 1) throw new HttpError(409, 'Debe quedar al menos un administrador activo');
    if (m === 'DELETE') {
      try { await query('DELETE FROM usuarios WHERE id_usuario=$1', [id]); await audit(user, 'DELETE', 'usuarios'); return send(res, 200, { ok: true }), true; } catch (e) {
        if (e.code !== '23503' && !/foreign key/.test(String(e.message))) throw e;
        await query('UPDATE usuarios SET estado=false WHERE id_usuario=$1', [id]); await audit(user, 'DESACTIVAR USUARIO', 'usuarios');
        return send(res, 200, { ok: true, desactivado: true, mensaje: 'El usuario tiene historial de operaciones: se desactivó en lugar de eliminarse' }), true;
      }
    }
  }
  return false;
}

async function atender_licencia({ res, user, name, id, body, m }) {
  if (name === 'licencia') {
    if (m === 'GET') {
      const l = (await query('SELECT clave, negocio, activada FROM licencia WHERE id=1')).rows[0];
      const v = l && lic.verify(l.clave);
      return send(res, 200, { activa: !!(v && v.ok), negocio: v && v.ok ? v.payload.negocio : null, tipo: v && v.ok ? v.payload.tipo : null, requerida: process.env.REQUIRE_LICENSE === '1', hardware_id: lic.hardwareId() }), true;
    }
    if (m === 'POST' && id === 'activar') {
      necesita(user, ADMIN);
      const v = lic.verify(body.clave);
      if (!v.ok) throw new HttpError(400, v.error);
      await query('DELETE FROM licencia'); await query('INSERT INTO licencia (id, clave, negocio, hardware) VALUES (1,$1,$2,$3)', [String(body.clave).trim(), v.payload.negocio, v.payload.hardware]);
      cache = { t: 0, ok: false }; await audit(user, 'ACTIVAR LICENCIA', 'licencia');
      return send(res, 200, { activa: true, negocio: v.payload.negocio, tipo: v.payload.tipo }), true;
    }
    return false;
  }
  return false;
}

async function atender_negocio({ res, user, name, body, m }) {
  if (name === 'negocio') {
    if (m === 'GET') return send(res, 200, await negocio()), true;
    if (m === 'PUT') {
      necesita(user, ADMIN);
      const f = {}; for (const k of ['nombre', 'nit', 'direccion', 'telefono', 'qr_pago']) if (k in body) f[k] = String(body[k] ?? '').trim().slice(0, 150);
      if ('logo' in body) { if (body.logo && (!/^data:image\/(png|jpeg);base64,/.test(body.logo) || body.logo.length > 400000)) throw new HttpError(400, 'El logo debe ser PNG o JPEG de máximo 300 KB'); f.logo = body.logo || null; }
      if ('nombre' in f && !f.nombre) throw new HttpError(400, 'El nombre del negocio es obligatorio');
      const k = Object.keys(f); if (!k.length) throw new HttpError(400, 'Sin cambios');
      const r = await query(`UPDATE negocio SET ${k.map((x, i) => `${x}=$${i + 1}`).join(',')} WHERE id_negocio=1 RETURNING *`, k.map((x) => f[x]));
      await audit(user, 'UPDATE #1', 'negocio'); return send(res, 200, r.rows[0]), true;
    }
    return false;
  }
  return false;
}

async function atender_qr({ res, name, sp, m }) {
  if (name === 'qr' && m === 'GET') {
    const texto = sp.get('texto') || (await negocio()).qr_pago || 'Tablero';
    return send(res, 200, { dataUrl: await QRCode.toDataURL(texto.slice(0, 300), { margin: 1, width: 240, color: { dark: '#0A1F44', light: '#FFFFFF' } }) }), true;
  }
  return false;
}

async function atender_comprobantes({ res, user, name, id, sub, body, sp, m }) {
  if (name === 'comprobantes') {
    if (m === 'POST' && id === null) {
      const idc = await require('./db').tx((t) => ventas.crearComprobante(t, user, body));
      await audit(user, `INSERT #${idc.id_comprobante}`, 'comprobantes');
      return send(res, 201, await ventas.conItems(idc.id_comprobante)), true;
    }
    if (m === 'GET' && id === null) {
      const q = sp.get('fecha'); const w = q ? "WHERE (fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::date=$1::date" : '';
      const r = await query(`SELECT id_comprobante, numero, tipo, cliente_nombre, metodo, total, estado, fecha FROM comprobantes ${w} ORDER BY id_comprobante DESC LIMIT ${lim(sp, 100)}`, q ? [q] : []);
      return send(res, 200, { data: r.rows, total: r.rows.length }), true;
    }
    if (m === 'GET' && id !== null) {
      const c = await ventas.conItems(id); if (!c) throw new HttpError(404, 'No encontrado');
      if (sub === 'pdf') {
        const neg = await negocio(); const factura = sp.get('formato') === 'factura';
        return sendBin(res, factura ? await pdf.factura(neg, c, c.items) : await pdf.tirilla(neg, c, c.items), 'application/pdf', `${factura ? 'factura' : 'tirilla'}_${pdf.numero(c.numero)}.pdf`), true;
      }
      return send(res, 200, c), true;
    }
    return false;
  }
  return false;
}

async function atender_mesas({ res, user, name, id, sub, sub2, body, m }) {
  if (name === 'mesas') {
    const idd = sub2 === undefined ? null : Number(sub2);
    if (m === 'GET' && id === 'tablero') return send(res, 200, await mesas.tablero()), true;
    if (Number.isInteger(id)) {
      if (m === 'GET' && sub === 'consumos' && idd === null) return send(res, 200, await mesas.consumos(id)), true;
      if (m === 'POST' && sub === 'ocupar') return send(res, 200, await mesas.ocupar(user, id, body)), true;
      if (m === 'POST' && sub === 'liberar') return send(res, 200, await mesas.liberar(user, id)), true;
      if (m === 'POST' && sub === 'consumos' && idd === null) return send(res, 201, await mesas.agregar(user, id, body)), true;
      if (m === 'PUT' && sub === 'consumos' && Number.isInteger(idd)) return send(res, 200, await mesas.cambiar(user, id, idd, body)), true;
      if (m === 'DELETE' && sub === 'consumos' && Number.isInteger(idd)) return send(res, 200, await mesas.quitar(user, id, idd)), true;
      if (m === 'POST' && sub === 'cerrar') return send(res, 200, await mesas.cerrar(user, id, body)), true;
    }
    return false;
  }
  return false;
}

async function atender_reservas({ res, user, name, id, sub, body, m }) {
  if (name === 'reservas' && m === 'POST' && id === 'rapida') {
    return send(res, 201, await ventas.reservaRapida(user, body)), true;
  }
  if (name === 'reservas' && m === 'POST' && sub === 'recordatorio') return send(res, 200, await ventas.recordatorio(user, id)), true;
  return false;
}

const ANON = 'Cliente anonimizado';

/** Atiende el derecho de supresión sin romper los soportes contables: se borran los datos personales y se conservan los comprobantes. */
async function anonimizarCliente(user, id) {
  const c = await query('SELECT id_cliente FROM clientes WHERE id_cliente=$1', [id]);
  if (!c.rows[0]) throw new HttpError(404, 'No encontrado');
  const nombre = `${ANON} #${id}`;
  await query('UPDATE clientes SET nombre=$2, telefono=NULL, correo=NULL, autorizacion_datos=false, fecha_autorizacion=NULL, anonimizado=true WHERE id_cliente=$1', [id, nombre]);
  await query('UPDATE comprobantes SET cliente_nombre=$2 WHERE id_cliente=$1', [id, nombre]);
  await query('UPDATE notificaciones SET telefono=NULL, mensaje=NULL WHERE id_reserva IN (SELECT id_reserva FROM reservas WHERE id_cliente=$1)', [id]);
  await audit(user, `ANONIMIZAR CLIENTE #${id}`, 'clientes');
  return { ok: true, mensaje: 'Datos personales del cliente anonimizados' };
}

/** Portabilidad y acceso: entrega en JSON todo lo que el sistema guarda de un titular. */
async function exportarCliente(user, id) {
  const c = await query('SELECT id_cliente, nombre, telefono, correo, fecha_registro, autorizacion_datos, fecha_autorizacion, anonimizado FROM clientes WHERE id_cliente=$1', [id]);
  if (!c.rows[0]) throw new HttpError(404, 'No encontrado');
  const reservas = (await query('SELECT id_reserva, id_cancha, fecha, hora_inicio, hora_fin, estado, valor FROM reservas WHERE id_cliente=$1 ORDER BY id_reserva', [id])).rows;
  const comprobantes = (await query('SELECT id_comprobante, numero, tipo, metodo, subtotal, descuento, total, estado, fecha FROM comprobantes WHERE id_cliente=$1 ORDER BY id_comprobante', [id])).rows;
  await audit(user, `EXPORTAR CLIENTE #${id}`, 'clientes');
  return { generado: new Date().toISOString(), titular: c.rows[0], reservas, comprobantes };
}

async function atender_clientes({ res, user, name, id, sub, m }) {
  if (name === 'clientes' && Number.isInteger(id) && m === 'POST' && sub === 'anonimizar') { necesita(user, ADMIN); return send(res, 200, await anonimizarCliente(user, id)), true; }
  if (name === 'clientes' && Number.isInteger(id) && m === 'GET' && sub === 'exportar') {
    necesita(user, ADMIN);
    return sendBin(res, Buffer.from(JSON.stringify(await exportarCliente(user, id), null, 2)), 'application/json', `titular_${id}.json`), true;
  }
  if (name === 'clientes' && m === 'GET' && id === 'frecuentes') {
    const r = await query("SELECT c.id_cliente, c.nombre, c.telefono, (SELECT COUNT(*) FROM reservas r WHERE r.id_cliente=c.id_cliente AND r.estado<>'Cancelada') AS reservas, (SELECT COUNT(*) FROM comprobantes p WHERE p.id_cliente=c.id_cliente) AS comprobantes FROM clientes c ORDER BY reservas DESC, comprobantes DESC LIMIT 20");
    return send(res, 200, { data: r.rows.map((x) => ({ ...x, reservas: Number(x.reservas), comprobantes: Number(x.comprobantes), frecuente: Number(x.reservas) + Number(x.comprobantes) >= 6 })) }), true;
  }
  if (name === 'clientes' && m === 'GET' && sub === 'historial') return send(res, 200, await ventas.historial(id)), true;
  if (name === 'clientes' && m === 'GET' && sub === 'fidelizacion') return send(res, 200, await ventas.fidelizacion(id)), true;
  return false;
}

async function atender_inventario({ res, name, id, m }) {
  if (name === 'inventario' && m === 'GET' && id === 'alertas') {
    const r = await query('SELECT id_producto, nombre, stock_actual, stock_minimo FROM productos WHERE estado AND stock_actual <= stock_minimo ORDER BY stock_actual');
    return send(res, 200, { data: r.rows, total: r.rows.length }), true;
  }
  return false;
}

async function atender_reportes({ res, user, name, id, sp, m }) {
  if (name === 'reportes' && m === 'GET') {
    if (!['diario', 'semanal', 'mensual'].includes(id)) throw new HttpError(404, 'Ruta no encontrada');
    if (id !== 'diario') necesita(user, ADMIN);
    const fecha = sp.get('fecha') || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new HttpError(400, 'Fecha no válida');
    const r = await reportes.generar(id, fecha); const f = sp.get('formato') || 'json'; const neg = await negocio();
    if (f === 'pdf') return sendBin(res, await pdf.reporte(neg, r), 'application/pdf', `reporte_${id}_${fecha}.pdf`), true;
    if (f === 'xlsx') return sendBin(res, await reportes.excel(neg, r), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `reporte_${id}_${fecha}.xlsx`), true;
    return send(res, 200, r), true;
  }
  return false;
}

async function atender_auditoria({ res, user, name, sp, m }) {
  if (name === 'auditoria' && m === 'GET') {
    necesita(user, ADMIN);
    const r = await query(`SELECT a.id_log, a.fecha_hora, u.nombre AS usuario, a.accion, a.tabla_afectada FROM auditoria a LEFT JOIN usuarios u ON u.id_usuario=a.id_usuario ORDER BY a.id_log DESC LIMIT ${lim(sp, 100)}`);
    return send(res, 200, { data: r.rows, total: r.rows.length }), true;
  }
  return false;
}

async function atender_respaldo({ res, user, name, m }) {
  if (name === 'respaldo' && m === 'GET') {
    necesita(user, ADMIN); await audit(user, 'RESPALDO', 'todas');
    return sendBin(res, Buffer.from(JSON.stringify(await backup.exportar())), 'application/json', `tablero_${new Date().toISOString().slice(0, 10)}.json`), true;
  }
  return false;
}

// Un manejador por recurso: cada uno devuelve true si atendió la petición.
const MANEJADORES = { usuarios: atender_usuarios, licencia: atender_licencia, negocio: atender_negocio, qr: atender_qr, comprobantes: atender_comprobantes, mesas: atender_mesas, reservas: atender_reservas, clientes: atender_clientes, inventario: atender_inventario, reportes: atender_reportes, auditoria: atender_auditoria, respaldo: atender_respaldo };

async function especial(ctx) {
  const h = MANEJADORES[ctx.name];
  return h ? h({ ...ctx, m: ctx.req.method }) : false;
}


module.exports = { especial, licenciaActiva };
