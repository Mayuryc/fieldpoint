const { query, mode } = require('../lib/db');
const auth = require('../lib/auth');
const RES = require('../lib/resources');

const { send, readJson } = require('../lib/http');
const { audit } = require('../lib/audit');
const { especial, licenciaActiva } = require('../lib/rutas');
const attempts = new Map();

function coerce(type, v) {
  if (v === undefined || v === null || v === '') return { v: null };
  switch (type[0]) {
    case 'i': { const n = Number(v); return Number.isInteger(n) && n >= 0 ? { v: n } : { e: true }; }
    case 'n': { const n = Number(v); return Number.isFinite(n) && n >= 0 ? { v: n } : { e: true }; }
    case 'b': return { v: v === true || v === 'true' };
    case 'd': return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { v } : { e: true };
    case 'h': return /^\d{2}:\d{2}(:\d{2})?$/.test(v) ? { v } : { e: true };
    default: { const s = String(v).trim(); return s.length <= 255 ? { v: s } : { e: true }; }
  }
}

function build(r, body, insert) {
  const out = {};
  for (const [name, type] of Object.entries(r.f)) {
    if (!(name in body)) { if (insert && type.endsWith('!')) return { error: `El campo ${name} es obligatorio` }; continue; }
    const c = coerce(type, body[name]);
    if (c.e || (c.v === null && type.endsWith('!'))) return { error: `Valor no válido en ${name}` };
    out[name] = c.v;
  }
  if (out.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.correo)) return { error: 'Correo no válido' };
  return { out };
}

const ymd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const fix = (r, row) => (r.t === 'reservas' && row ? { ...row, fecha: ymd(row.fecha) } : row);

async function overlap(b, id) {
  const q = await query("SELECT id_reserva FROM reservas WHERE id_cancha=$1 AND fecha=$2 AND estado<>'Cancelada' AND hora_inicio < $4 AND hora_fin > $3 AND id_reserva<>$5", [b.id_cancha, b.fecha, b.hora_inicio, b.hora_fin, id || 0]);
  return q.rows.length > 0;
}

async function login(req, res, body) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0];
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 10) return send(res, 429, { error: 'Demasiados intentos. Intente de nuevo en un minuto.' });
  attempts.set(ip, [...recent, now]);
  const q = await query('SELECT u.id_usuario, u.nombre, u.contrasena_cifrada, u.estado, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id_rol=u.id_rol WHERE u.correo=$1', [String(body.correo || '').trim().toLowerCase()]);
  const u = q.rows[0];
  if (!u || !u.estado || !auth.verify(String(body.password || ''), u.contrasena_cifrada)) return send(res, 401, { error: 'Credenciales no válidas' });
  await audit({ sub: u.id_usuario }, 'LOGIN', 'usuarios');
  return send(res, 200, { token: auth.sign(u), usuario: { id: u.id_usuario, nombre: u.nombre, rol: u.rol } });
}

async function crud(req, res, r, id, user, body, sp) {
  const sel = [r.pk, ...Object.keys(r.f), ...(r.extra || [])].join(', ');
  const m = req.method;
  if (m === 'GET' && !id) {
    const lim = Math.min(Math.max(parseInt(sp.get('limit'), 10) || 50, 1), 200);
    const off = Math.max(parseInt(sp.get('offset'), 10) || 0, 0);
    const q = sp.get('q');
    const where = q && r.search ? `WHERE ${r.search} ILIKE $1` : '';
    const args = q && r.search ? [`%${q}%`] : [];
    const rows = await query(`SELECT ${sel} FROM ${r.t} ${where} ORDER BY ${r.pk} DESC LIMIT ${lim} OFFSET ${off}`, args);
    const c = await query(`SELECT COUNT(*) AS n FROM ${r.t} ${where}`, args);
    return send(res, 200, { data: rows.rows.map((x) => fix(r, x)), total: Number(c.rows[0].n) });
  }
  if (m === 'GET') {
    const q = await query(`SELECT ${sel} FROM ${r.t} WHERE ${r.pk}=$1`, [id]);
    return q.rows[0] ? send(res, 200, fix(r, q.rows[0])) : send(res, 404, { error: 'No encontrado' });
  }
  const b = build(r, body, m === 'POST');
  if (b.error) return send(res, 400, { error: b.error });
  const data = b.out;
  if (r.t === 'usuarios') {
    if (body.password !== undefined || m === 'POST') {
      if (String(body.password || '').length < 8) return send(res, 400, { error: 'La contraseña debe tener al menos 8 caracteres' });
      data.contrasena_cifrada = auth.hash(String(body.password));
    }
    if (data.correo) data.correo = data.correo.toLowerCase();
  }
  if (r.t === 'reservas') {
    let cur = data;
    if (m === 'PUT') { const o = await query('SELECT * FROM reservas WHERE id_reserva=$1', [id]); if (!o.rows[0]) return send(res, 404, { error: 'No encontrado' }); cur = { ...o.rows[0], ...data, fecha: data.fecha || ymd(o.rows[0].fecha) }; }
    if (String(cur.hora_fin) <= String(cur.hora_inicio)) return send(res, 400, { error: 'La hora final debe ser mayor que la inicial' });
    if ((cur.estado || 'Reservada') !== 'Cancelada' && await overlap(cur, id)) return send(res, 409, { error: 'La cancha ya está reservada en ese horario' });
  }
  let q;
  if (m === 'POST') {
    const k = Object.keys(data);
    q = await query(`INSERT INTO ${r.t} (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING ${sel}`, k.map((x) => data[x]));
  } else if (m === 'PUT') {
    const k = Object.keys(data);
    if (!k.length) return send(res, 400, { error: 'Sin cambios' });
    q = await query(`UPDATE ${r.t} SET ${k.map((x, i) => `${x}=$${i + 1}`).join(',')} WHERE ${r.pk}=$${k.length + 1} RETURNING ${sel}`, [...k.map((x) => data[x]), id]);
  } else {
    q = await query(`DELETE FROM ${r.t} WHERE ${r.pk}=$1 RETURNING ${r.pk}`, [id]);
    if (!q.rows[0]) return send(res, 404, { error: 'No encontrado' });
    await audit(user, 'DELETE', r.t);
    return send(res, 200, { ok: true });
  }
  if (!q.rows[0]) return send(res, 404, { error: 'No encontrado' });
  await audit(user, m === 'POST' ? 'INSERT' : 'UPDATE', r.t);
  return send(res, m === 'POST' ? 201 : 200, fix(r, q.rows[0]));
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const route = (url.searchParams.get('p') ?? url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
    const [name, rawId, sub, sub2] = route.split('/');
    if (name === 'health') return send(res, 200, { ok: true, db: await mode() });
    if (name === 'login' && req.method === 'POST') return await login(req, res, await readJson(req));
    const user = auth.fromRequest(req);
    if (!user) return send(res, 401, { error: 'Sesión requerida' });
    if (process.env.REQUIRE_LICENSE === '1' && name !== 'licencia' && !(await licenciaActiva())) return send(res, 402, { error: 'Se requiere activar la licencia del producto' });
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return send(res, 405, { error: 'Método no permitido' });
    const id = rawId === undefined ? null : (Number.isInteger(Number(rawId)) && rawId !== '' ? Number(rawId) : rawId);
    const body = req.method === 'POST' || req.method === 'PUT' ? await readJson(req) : {};
    if (await especial({ req, res, user, name, id, sub, sub2, body, sp: url.searchParams })) return;
    const r = RES[name];
    if (!r) return send(res, 404, { error: 'Ruta no encontrada' });
    const writing = req.method !== 'GET';
    if (!(writing ? r.write : r.read || ['Administrador', 'Operador']).includes(user.rol)) return send(res, 403, { error: 'No tiene permiso para esta operación' });
    if (id !== null && !Number.isInteger(id)) return send(res, 400, { error: 'Identificador no válido' });
    if ((req.method === 'PUT' || req.method === 'DELETE') && id === null) return send(res, 400, { error: 'Falta el identificador' });
    return await crud(req, res, r, id, user, body, url.searchParams);
  } catch (e) {
    const msg = String(e.message || '');
    if (e.code === '23503' || /violates foreign key/.test(msg)) return send(res, 409, { error: 'Operación no permitida: hay registros relacionados' });
    if (e.code === '23505' || /duplicate key|unique constraint/.test(msg)) return send(res, 409, { error: 'Ya existe un registro con ese valor' });
    if (e.status) return send(res, e.status, { error: e.message });
    if (/^22/.test(e.code || '')) return send(res, 400, { error: 'Dato no válido' });
    if (e instanceof SyntaxError) return send(res, 400, { error: 'JSON no válido' });
    console.error(e.message);
    return send(res, 500, { error: 'Error interno' });
  }
};
