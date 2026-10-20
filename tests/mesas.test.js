process.env.SCRYPT_N = '1024';
process.env.JWT_SECRET = 'secreto-de-pruebas';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');
const db = require('../lib/db');
const backup = require('../lib/backup');

let server; let base; let admin; let oper;
const call = async (method, path, token, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const tipo = r.headers.get('content-type') || '';
  return { s: r.status, j: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const login = async (c) => (await call('POST', '/api/login', null, { correo: c, password: 'FieldPoint2026*' })).j.token;
const mesa = async (n) => (await call('GET', '/api/mesas/tablero', admin)).j.data.find((m) => m.numero === n);
const stock = async (id) => Number((await call('GET', '/api/productos/' + id, admin)).j.stock_actual);

before(async () => {
  db.reset(); server = createServer().listen(0); await new Promise((r) => server.once('listening', r));
  base = 'http://localhost:' + server.address().port; admin = await login('admin@fieldpoint.co'); oper = await login('operador@fieldpoint.co');
});
after(() => server.close());

test('tablero: las mesas nuevas están libres y sin cuenta', async () => {
  const r = await call('GET', '/api/mesas/tablero', oper);
  assert.equal(r.s, 200); assert.equal(r.j.data.length, 5);
  assert.ok(r.j.data.every((m) => m.estado === 'Libre' && m.cuenta === null));
  assert.equal(r.j.data[0].numero, 1);
});
test('roles: solo el administrador crea y elimina mesas; ambos cambian el estado y registran consumos', async () => {
  assert.equal((await call('POST', '/api/mesas', oper, { numero: 20 })).s, 403);
  assert.equal((await call('DELETE', '/api/mesas/1', oper)).s, 403);
  const c = await call('POST', '/api/mesas', admin, { numero: 20 });
  assert.equal(c.s, 201); assert.equal(c.j.estado, 'Libre');
  assert.equal((await call('POST', '/api/mesas', admin, { numero: 20 })).s, 409);
  assert.equal((await call('POST', `/api/mesas/${c.j.id_mesa}/ocupar`, oper, {})).s, 200);
  assert.equal((await call('DELETE', `/api/mesas/${c.j.id_mesa}`, admin)).s, 409);
  assert.equal((await call('POST', `/api/mesas/${c.j.id_mesa}/liberar`, oper)).s, 200);
  assert.equal((await call('DELETE', `/api/mesas/${c.j.id_mesa}`, admin)).s, 409, 'tiene historial de cuentas');
  const d = await call('POST', '/api/mesas', admin, { numero: 21 });
  assert.equal((await call('DELETE', `/api/mesas/${d.j.id_mesa}`, admin)).s, 200);
});
test('el estado no se edita a mano: el CRUD solo cambia el número', async () => {
  const r = await call('PUT', '/api/mesas/2', admin, { estado: 'Ocupada', numero: 2 });
  assert.equal(r.s, 200); assert.equal(r.j.estado, 'Libre');
});
test('ocupar una mesa abre una cuenta y no se puede ocupar dos veces', async () => {
  const r = await call('POST', '/api/mesas/1/ocupar', oper, { id_cliente: 1 });
  assert.equal(r.s, 200); assert.equal(r.j.estado, 'Ocupada'); assert.equal(r.j.cuenta.cliente, 'Los Halcones'); assert.equal(r.j.cuenta.total, 0);
  assert.equal((await call('POST', '/api/mesas/1/ocupar', oper, {})).s, 409);
  assert.equal((await call('POST', '/api/mesas/2/ocupar', oper, { id_cliente: 999 })).s, 400);
  assert.equal((await call('POST', '/api/mesas/999/ocupar', oper, {})).s, 404);
  assert.equal((await mesa(2)).estado, 'Libre');
});
test('consumos: solo con la mesa ocupada, vinculados a producto y cliente, y acumulados', async () => {
  assert.equal((await call('POST', '/api/mesas/3/consumos', oper, { id_producto: 1, cantidad: 1 })).s, 409);
  const a = await call('POST', '/api/mesas/1/consumos', oper, { id_producto: 1, cantidad: 2 });
  assert.equal(a.s, 201); assert.equal(a.j.consumos[0].producto, 'Gaseosa'); assert.equal(a.j.consumos[0].cliente, 'Los Halcones'); assert.equal(a.j.total, 8000);
  const b = await call('POST', '/api/mesas/1/consumos', oper, { id_producto: 1, cantidad: 1 });
  assert.equal(b.j.consumos.length, 1); assert.equal(b.j.consumos[0].cantidad, 3); assert.equal(b.j.total, 12000);
  const c = await call('POST', '/api/mesas/1/consumos', oper, { id_producto: 7, cantidad: 1, id_cliente: 2 });
  assert.equal(c.j.consumos.length, 2); assert.equal(c.j.total, 32000);
  assert.deepEqual(c.j.porCliente.map((x) => [x.cliente, x.total]).sort(), [['Amigos del barrio', 20000], ['Los Halcones', 12000]]);
  const t = await mesa(1); assert.equal(t.cuenta.total, 32000); assert.equal(t.cuenta.items, 4);
  assert.equal((await call('GET', '/api/mesas/1/consumos', admin)).j.total, 32000);
});
test('validaciones de consumo', async () => {
  assert.equal((await call('POST', '/api/mesas/1/consumos', oper, { id_producto: 999, cantidad: 1 })).s, 400);
  assert.equal((await call('POST', '/api/mesas/1/consumos', oper, { id_producto: 1, cantidad: 0 })).s, 400);
  assert.equal((await call('POST', '/api/mesas/1/consumos', oper, { id_producto: 1, cantidad: 'x' })).s, 400);
  assert.equal((await call('POST', '/api/mesas/1/consumos', oper, { id_producto: 1, cantidad: 1, id_cliente: 999 })).s, 400);
  assert.equal((await call('GET', '/api/mesas/1/consumos', null)).s, 401);
});
test('existencias: el stock se reserva entre las mesas abiertas, sin descontarse hasta el cierre', async () => {
  await call('POST', '/api/mesas/2/ocupar', oper, {});
  assert.equal(await stock(5), 4, 'Papas');
  assert.equal((await call('POST', '/api/mesas/1/consumos', oper, { id_producto: 5, cantidad: 3 })).s, 201);
  const r = await call('POST', '/api/mesas/2/consumos', oper, { id_producto: 5, cantidad: 2 });
  assert.equal(r.s, 409); assert.match(r.j.error, /Sin existencias de Papas \(disponibles: 1\)/);
  assert.equal((await call('POST', '/api/mesas/2/consumos', oper, { id_producto: 5, cantidad: 1 })).s, 201);
  assert.equal(await stock(5), 4, 'el stock no baja hasta cerrar');
  assert.equal((await call('POST', '/api/mesas/1/consumos', oper, { id_producto: 5, cantidad: 1 })).s, 409);
});
test('cambiar la cantidad y quitar consumos', async () => {
  const lin = (await call('GET', '/api/mesas/1/consumos', oper)).j.consumos.find((x) => x.producto === 'Papas');
  assert.equal((await call('PUT', `/api/mesas/1/consumos/${lin.id_detalle}`, oper, { cantidad: 1 })).j.consumos.find((x) => x.producto === 'Papas').cantidad, 1);
  assert.equal((await call('PUT', `/api/mesas/1/consumos/${lin.id_detalle}`, oper, { cantidad: 9 })).s, 409);
  assert.equal((await call('PUT', `/api/mesas/1/consumos/${lin.id_detalle}`, oper, { cantidad: 0 })).s, 400);
  assert.equal((await call('PUT', '/api/mesas/1/consumos/99999', oper, { cantidad: 1 })).s, 404);
  const ids = (await call('GET', '/api/mesas/2/consumos', oper)).j.consumos.map((x) => x.id_detalle);
  assert.equal((await call('PUT', `/api/mesas/1/consumos/${ids[0]}`, oper, { cantidad: 1 })).s, 404, 'una línea de otra mesa no se toca');
  const q = await call('DELETE', `/api/mesas/1/consumos/${lin.id_detalle}`, oper);
  assert.equal(q.s, 200); assert.ok(!q.j.consumos.some((x) => x.producto === 'Papas'));
  assert.equal((await call('DELETE', `/api/mesas/1/consumos/${lin.id_detalle}`, oper)).s, 404);
});
test('marcar libre solo si no hay consumos', async () => {
  assert.equal((await call('POST', '/api/mesas/1/liberar', oper)).s, 409);
  const l = await call('POST', '/api/mesas/2/liberar', oper);
  assert.equal(l.s, 409, 'tiene una papa');
  const ids = (await call('GET', '/api/mesas/2/consumos', oper)).j.consumos.map((x) => x.id_detalle);
  await call('DELETE', `/api/mesas/2/consumos/${ids[0]}`, oper);
  const ok = await call('POST', '/api/mesas/2/liberar', oper);
  assert.equal(ok.s, 200); assert.equal(ok.j.estado, 'Libre'); assert.equal(ok.j.cuenta, null);
  const est = (await db.query("SELECT estado FROM cuentas WHERE id_mesa=2 ORDER BY id_cuenta DESC LIMIT 1")).rows[0].estado; assert.equal(est, 'Cancelada');
});
test('cerrar la mesa genera el comprobante, descuenta inventario y la deja libre', async () => {
  const g = await stock(1); const p = await stock(7);
  assert.equal((await call('POST', '/api/mesas/1/cerrar', oper, { metodo: 'Cripto' })).s, 400);
  assert.equal((await mesa(1)).estado, 'Ocupada', 'una operación fallida no cierra la mesa');
  const r = await call('POST', '/api/mesas/1/cerrar', oper, { metodo: 'Transferencia', tipo: 'Factura' });
  assert.equal(r.s, 200); assert.equal(Number(r.j.total), 32000); assert.equal(r.j.tipo, 'Factura'); assert.equal(r.j.cliente_nombre, 'Los Halcones'); assert.equal(r.j.items.length, 2);
  assert.equal(await stock(1), g - 3); assert.equal(await stock(7), p - 1);
  const m = await mesa(1); assert.equal(m.estado, 'Libre'); assert.equal(m.cuenta, null);
  const cu = (await db.query("SELECT estado, total, id_comprobante FROM cuentas WHERE id_mesa=1 ORDER BY id_cuenta DESC LIMIT 1")).rows[0];
  assert.equal(cu.estado, 'Cerrada'); assert.equal(Number(cu.total), 32000); assert.equal(cu.id_comprobante, r.j.id_comprobante);
  assert.equal((await call('POST', '/api/mesas/1/cerrar', oper, { metodo: 'Efectivo' })).s, 409, 'ya está libre');
  const pdf = await call('GET', `/api/comprobantes/${r.j.id_comprobante}/pdf`, oper); assert.equal(pdf.j.subarray(0, 4).toString(), '%PDF');
});
test('cerrar una mesa sin consumos se rechaza y mantiene el precio registrado', async () => {
  await call('POST', '/api/mesas/3/ocupar', oper, {});
  assert.equal((await call('POST', '/api/mesas/3/cerrar', oper, { metodo: 'Efectivo' })).s, 409);
  await call('POST', '/api/mesas/3/consumos', oper, { id_producto: 3, cantidad: 2 });
  await call('PUT', '/api/productos/3', admin, { precio_venta: 9999 });
  const r = await call('POST', '/api/mesas/3/cerrar', oper, { metodo: 'Efectivo' });
  assert.equal(Number(r.j.total), 10000, 'se cobra el precio con el que se registró el consumo'); assert.equal(r.j.cliente_nombre, 'Mesa 3');
});
test('el reporte incluye las ventas por mesa cerrada y la auditoría registra las acciones', async () => {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const rep = (await call('GET', '/api/reportes/diario?fecha=' + hoy, admin)).j;
  assert.equal(rep.porMesa.find((x) => x.nombre === 'Mesa 1').total, 32000); assert.equal(rep.porMesa.find((x) => x.nombre === 'Mesa 3').total, 10000);
  const a = (await call('GET', '/api/auditoria?limit=200', admin)).j.data.map((x) => x.accion);
  for (const k of ['OCUPAR #1', 'CERRAR MESA #1', 'LIBERAR #2']) assert.ok(a.includes(k), k);
  assert.ok(a.some((x) => /^CONSUMO #\d+/.test(x)));
});
test('el respaldo conserva cuentas, consumos y su vínculo con el comprobante', async () => {
  await call('POST', '/api/mesas/4/ocupar', oper, { id_cliente: 2 }); await call('POST', '/api/mesas/4/consumos', oper, { id_producto: 4, cantidad: 2 });
  const dump = (await call('GET', '/api/respaldo', admin)).j;
  assert.ok(dump.tablas.cuentas.some((c) => c.id_comprobante)); assert.ok(dump.tablas.detalle_cuenta.every((d) => 'id_cliente' in d));
  await call('POST', '/api/mesas/4/liberar', oper);
  await backup.restaurar(dump);
  const t = await mesa(4); assert.equal(t.estado, 'Ocupada'); assert.equal(t.cuenta.items, 2); assert.equal(t.cuenta.cliente, 'Amigos del barrio');
});
