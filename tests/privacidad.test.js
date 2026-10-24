process.env.SCRYPT_N = '1024';
process.env.JWT_SECRET = 'secreto-de-pruebas';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');
const db = require('../lib/db');

let server; let base; let admin; let oper;
const call = async (method, path, token, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const tipo = r.headers.get('content-type') || '';
  const j = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()).toString();
  return { s: r.status, j, h: r.headers };
};
const login = async (c) => (await call('POST', '/api/login', null, { correo: c, password: 'Tablero2026*' })).j.token;

before(async () => {
  db.reset(); server = createServer().listen(0); await new Promise((r) => server.once('listening', r));
  base = 'http://localhost:' + server.address().port; admin = await login('admin@tablero.test'); oper = await login('operador@tablero.test');
});
after(() => server.close());

test('la autorización del tratamiento de datos queda registrada con fecha fijada por el servidor', async () => {
  const sin = await call('POST', '/api/clientes', oper, { nombre: 'Sin autorización', telefono: '3001112233' });
  assert.equal(sin.s, 201); assert.equal(sin.j.autorizacion_datos, false); assert.equal(sin.j.fecha_autorizacion, null);
  const con = await call('POST', '/api/clientes', oper, { nombre: 'Con autorización', autorizacion_datos: true, fecha_autorizacion: '1999-01-01' });
  assert.equal(con.s, 201); assert.equal(con.j.autorizacion_datos, true); assert.ok(con.j.fecha_autorizacion);
  assert.ok(!String(con.j.fecha_autorizacion).startsWith('1999'));
  const rev = await call('PUT', '/api/clientes/' + con.j.id_cliente, oper, { autorizacion_datos: false });
  assert.equal(rev.j.fecha_autorizacion, null);
});

test('exportar datos de un titular: solo administrador, con reservas y comprobantes, y queda auditado', async () => {
  const c = (await call('POST', '/api/clientes', oper, { nombre: 'Titular Prueba', telefono: '3009998877', correo: 'titular@correo.co', autorizacion_datos: true })).j;
  await call('POST', '/api/comprobantes', oper, { metodo: 'Efectivo', id_cliente: c.id_cliente, cliente_nombre: 'Titular Prueba', items: [{ tipo: 'consumo', id_producto: 1, cantidad: 1 }] });
  assert.equal((await call('GET', `/api/clientes/${c.id_cliente}/exportar`, oper)).s, 403);
  const r = await call('GET', `/api/clientes/${c.id_cliente}/exportar`, admin);
  assert.equal(r.s, 200); const d = r.j;
  assert.equal(d.titular.correo, 'titular@correo.co'); assert.ok(Array.isArray(d.reservas)); assert.ok(Array.isArray(d.comprobantes));
  assert.equal((await call('GET', '/api/clientes/99999/exportar', admin)).s, 404);
  const a = (await call('GET', '/api/auditoria?limit=200', admin)).j.data;
  assert.ok(a.some((x) => x.accion === `EXPORTAR CLIENTE #${c.id_cliente}`));
});

test('anonimizar cliente: borra datos personales, conserva comprobantes y exige administrador', async () => {
  const c = (await call('POST', '/api/clientes', oper, { nombre: 'Persona Real', telefono: '3001234567', correo: 'real@correo.co', autorizacion_datos: true })).j;
  const comp = (await call('POST', '/api/comprobantes', oper, { metodo: 'Efectivo', id_cliente: c.id_cliente, cliente_nombre: 'Persona Real', items: [{ tipo: 'consumo', id_producto: 1, cantidad: 1 }] })).j;
  assert.equal((await call('POST', `/api/clientes/${c.id_cliente}/anonimizar`, oper, {})).s, 403);
  assert.equal((await call('POST', `/api/clientes/${c.id_cliente}/anonimizar`, admin, {})).s, 200);
  const x = (await call('GET', '/api/clientes/' + c.id_cliente, admin)).j;
  assert.equal(x.nombre, `Cliente anonimizado #${c.id_cliente}`); assert.equal(x.telefono, null); assert.equal(x.correo, null);
  assert.equal(x.anonimizado, true); assert.equal(x.autorizacion_datos, false);
  const cp = (await call('GET', '/api/comprobantes/' + comp.id_comprobante, admin)).j;
  assert.equal(cp.cliente_nombre, `Cliente anonimizado #${c.id_cliente}`); assert.ok(Number(cp.total) > 0);
  assert.equal((await call('POST', '/api/clientes/99999/anonimizar', admin, {})).s, 404);
});

test('cabeceras de seguridad: CSP restrictiva y páginas legales públicas', async () => {
  const r = await call('GET', '/sistema.html');
  const csp = r.h.get('content-security-policy'); assert.ok(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"));
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp));
  for (const p of ['/privacidad.html', '/terminos.html']) { const x = await call('GET', p); assert.equal(x.s, 200); assert.ok(String(x.j).includes('Tablero')); }
});
