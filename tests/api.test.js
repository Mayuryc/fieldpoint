process.env.SCRYPT_N = '1024'; // costo reducido solo para que las pruebas corran rápido
process.env.JWT_SECRET = 'secreto-de-pruebas';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');
const db = require('../lib/db');

let server; let base; let admin; let oper;
const call = async (method, path, token, body, headers = {}) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  let j = null; try { j = await r.json(); } catch { j = null; }
  return { s: r.status, j, h: r.headers };
};
const login = async (correo, password) => call('POST', '/api/login', null, { correo, password });

before(async () => {
  db.reset();
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = 'http://localhost:' + server.address().port;
  admin = (await login('admin@tablero.test', 'Tablero2026*')).j.token;
  oper = (await login('operador@tablero.test', 'Tablero2026*')).j.token;
});
after(() => server.close());

test('health responde y expone el modo de base de datos', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.s, 200); assert.equal(r.j.ok, true);
});
test('login válido devuelve token y rol', async () => {
  const r = await login('admin@tablero.test', 'Tablero2026*');
  assert.equal(r.s, 200); assert.equal(r.j.usuario.rol, 'Administrador'); assert.ok(r.j.token);
});
test('login con contraseña incorrecta o usuario inexistente da 401', async () => {
  assert.equal((await login('admin@tablero.test', 'incorrecta')).s, 401);
  assert.equal((await login('nadie@tablero.test', 'Tablero2026*')).s, 401);
  assert.equal((await call('POST', '/api/login', null, {})).s, 401);
});
test('las cabeceras de seguridad están presentes y no se cachea', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.h.get('x-content-type-options'), 'nosniff'); assert.equal(r.h.get('x-frame-options'), 'DENY'); assert.equal(r.h.get('cache-control'), 'no-store');
});
test('sin token o con token alterado se rechaza (401)', async () => {
  assert.equal((await call('GET', '/api/productos')).s, 401);
  assert.equal((await call('GET', '/api/productos', admin + 'x')).s, 401);
  assert.equal((await call('GET', '/api/productos', 'abc.def.ghi')).s, 401);
});
test('autorización por rol: el Operador consulta pero no modifica el catálogo ni ve usuarios', async () => {
  assert.equal((await call('GET', '/api/productos', oper)).s, 200);
  assert.equal((await call('POST', '/api/productos', oper, { nombre: 'X', precio_venta: 1 })).s, 403);
  assert.equal((await call('DELETE', '/api/productos/1', oper)).s, 403);
  assert.equal((await call('GET', '/api/usuarios', oper)).s, 403);
  assert.equal((await call('POST', '/api/clientes', oper, { nombre: 'Cliente del operador' })).s, 201);
});
test('CRUD de productos: insertar, consultar, actualizar y eliminar', async () => {
  const c = await call('POST', '/api/productos', admin, { nombre: 'Hamburguesa', precio_venta: 12000, costo: 6000, stock_actual: 10, stock_minimo: 4 });
  assert.equal(c.s, 201); const id = c.j.id_producto; assert.ok(id);
  assert.equal((await call('GET', '/api/productos/' + id, admin)).j.nombre, 'Hamburguesa');
  const u = await call('PUT', '/api/productos/' + id, admin, { precio_venta: 13500 });
  assert.equal(u.s, 200); assert.equal(Number(u.j.precio_venta), 13500);
  assert.equal((await call('DELETE', '/api/productos/' + id, admin)).s, 200);
  assert.equal((await call('GET', '/api/productos/' + id, admin)).s, 404);
  assert.equal((await call('DELETE', '/api/productos/' + id, admin)).s, 404);
});
test('validación de productos: obligatorios, negativos y no numéricos dan 400', async () => {
  assert.equal((await call('POST', '/api/productos', admin, { precio_venta: 1 })).s, 400);
  assert.equal((await call('POST', '/api/productos', admin, { nombre: 'A', precio_venta: -5 })).s, 400);
  assert.equal((await call('POST', '/api/productos', admin, { nombre: 'A', precio_venta: 'abc' })).s, 400);
  assert.equal((await call('POST', '/api/productos', admin, { nombre: 'x'.repeat(300), precio_venta: 1 })).s, 400);
  assert.equal((await call('PUT', '/api/productos/1', admin, {})).s, 400);
});
test('consultar con búsqueda y paginación', async () => {
  const todos = await call('GET', '/api/productos?limit=2', admin);
  assert.equal(todos.j.data.length, 2); assert.ok(todos.j.total >= 6);
  const q = await call('GET', '/api/productos?q=gaseo', admin);
  assert.equal(q.j.data.length, 1); assert.equal(q.j.data[0].nombre, 'Gaseosa');
  const p2 = await call('GET', '/api/productos?limit=2&offset=2', admin);
  assert.notEqual(p2.j.data[0].id_producto, todos.j.data[0].id_producto);
});
test('CRUD de clientes con validación de correo', async () => {
  const c = await call('POST', '/api/clientes', admin, { nombre: 'Equipo Sur', telefono: '3001112233', correo: 'sur@correo.co' });
  assert.equal(c.s, 201);
  assert.equal((await call('POST', '/api/clientes', admin, { nombre: 'Malo', correo: 'no-es-correo' })).s, 400);
  assert.equal((await call('PUT', '/api/clientes/' + c.j.id_cliente, admin, { telefono: '3009998877' })).j.telefono, '3009998877');
  assert.equal((await call('DELETE', '/api/clientes/' + c.j.id_cliente, admin)).s, 200);
});
test('CRUD de canchas, mesas, proveedores y categorías', async () => {
  for (const [ruta, cuerpo, campo, cambio] of [['canchas', { nombre: 'Cancha 2', tarifa_hora: 50000 }, 'nombre', 'Cancha 2B'], ['mesas', { numero: 9 }, 'numero', 10], ['proveedores', { nombre: 'Proveedor Z' }, 'nombre', 'Proveedor Z2'], ['categorias', { nombre: 'Aseo' }, 'nombre', 'Aseo y limpieza']]) {
    const c = await call('POST', '/api/' + ruta, admin, cuerpo); assert.equal(c.s, 201, ruta);
    const id = Object.values(c.j)[0];
    const u = await call('PUT', `/api/${ruta}/${id}`, admin, { [campo]: cambio }); assert.equal(u.s, 200, ruta); assert.equal(u.j[campo], cambio);
    assert.equal((await call('DELETE', `/api/${ruta}/${id}`, admin)).s, 200, ruta);
  }
});
test('reservas: crear, evitar cruces de horario, validar horas y cancelar', async () => {
  const b = { id_cancha: 1, id_cliente: 1, fecha: '2026-10-20', hora_inicio: '18:00', hora_fin: '19:00', valor: 60000 };
  const c = await call('POST', '/api/reservas', admin, b); assert.equal(c.s, 201);
  assert.equal((await call('POST', '/api/reservas', admin, { ...b, hora_inicio: '18:30', hora_fin: '19:30' })).s, 409);
  const ady = await call('POST', '/api/reservas', oper, { ...b, hora_inicio: '19:00', hora_fin: '20:00' }); assert.equal(ady.s, 201);
  assert.equal((await call('POST', '/api/reservas', admin, { ...b, hora_inicio: '21:00', hora_fin: '20:00' })).s, 400);
  assert.equal((await call('POST', '/api/reservas', admin, { ...b, fecha: '20/10/2026' })).s, 400);
  assert.equal((await call('PUT', '/api/reservas/' + ady.j.id_reserva, admin, { hora_inicio: '18:30' })).s, 409);
  assert.equal((await call('PUT', '/api/reservas/' + c.j.id_reserva, admin, { estado: 'Cancelada' })).s, 200);
  assert.equal((await call('POST', '/api/reservas', admin, { ...b, hora_inicio: '18:00', hora_fin: '18:45' })).s, 201);
});
test('integridad referencial: no se elimina lo que tiene registros relacionados', async () => {
  const r = await call('DELETE', '/api/categorias/1', admin);
  assert.equal(r.s, 409); assert.match(r.j.error, /relacionados/);
  assert.equal((await call('POST', '/api/reservas', admin, { id_cancha: 999, id_cliente: 1, fecha: '2026-11-01', hora_inicio: '10:00', hora_fin: '11:00' })).s, 409);
});
test('usuarios: hash scrypt, sin exponer la contraseña, correo único y desactivación', async () => {
  assert.equal((await call('POST', '/api/usuarios', admin, { nombre: 'N', usuario: 'enene', correo: 'n@fp.co', id_rol: 2, password: 'corta' })).s, 400);
  const c = await call('POST', '/api/usuarios', admin, { nombre: 'Nuevo', usuario: 'Nuevo.Op', correo: 'Nuevo@FP.co', id_rol: 2, password: 'ClaveSegura1' });
  assert.equal(c.s, 201); assert.equal('contrasena_cifrada' in c.j, false); assert.equal(c.j.correo, 'nuevo@fp.co'); assert.equal(c.j.usuario, 'nuevo.op');
  const guardado = (await db.query('SELECT contrasena_cifrada FROM usuarios WHERE id_usuario=$1', [c.j.id_usuario])).rows[0].contrasena_cifrada;
  assert.match(guardado, /^scrypt\$\d+\$[0-9a-f]{32}\$[0-9a-f]{128}$/); assert.ok(!guardado.includes('ClaveSegura1'));
  assert.equal((await call('POST', '/api/usuarios', admin, { nombre: 'Dup', usuario: 'otro.op', correo: 'nuevo@fp.co', id_rol: 2, password: 'ClaveSegura1' })).s, 409);
  assert.equal((await login('nuevo@fp.co', 'ClaveSegura1')).s, 200);
  await call('PUT', '/api/usuarios/' + c.j.id_usuario, admin, { estado: false });
  assert.equal((await login('nuevo@fp.co', 'ClaveSegura1')).s, 401);
  const lista = await call('GET', '/api/usuarios', admin); assert.ok(lista.j.data.every((u) => !('contrasena_cifrada' in u)));
});
test('la misma contraseña genera hashes distintos (sal única) y se verifica en tiempo constante', () => {
  const a = require('../lib/auth');
  const h1 = a.hash('MismaClave123'); const h2 = a.hash('MismaClave123');
  assert.notEqual(h1, h2); assert.equal(a.verify('MismaClave123', h1), true); assert.equal(a.verify('otra', h1), false); assert.equal(a.verify('x', 'texto-plano'), false);
});
test('rutas y entradas inválidas: 404, 400 y 405', async () => {
  assert.equal((await call('GET', '/api/inexistente', admin)).s, 404);
  assert.equal((await call('GET', '/api/productos/abc', admin)).s, 400);
  assert.equal((await call('PUT', '/api/productos', admin, { nombre: 'a' })).s, 400);
  assert.equal((await call('POST', '/api/productos', admin, '{json roto')).s, 400);
  assert.equal((await call('PATCH', '/api/productos/1', admin, {})).s, 405);
});
test('las escrituras quedan registradas en la auditoría', async () => {
  const n = (await db.query("SELECT COUNT(*) AS n FROM auditoria WHERE tabla_afectada='productos'")).rows[0].n;
  assert.ok(Number(n) >= 3);
});
test('el servidor estático sirve la aplicación y bloquea rutas fuera de /public', async () => {
  const r = await fetch(base + '/'); assert.equal(r.status, 200); assert.match(await r.text(), /Tablero/);
  assert.equal((await fetch(base + '/..%2fpackage.json')).status, 404);
  assert.equal((await fetch(base + '/no-existe.html')).status, 404);
});
test('inicio de sesión por usuario (también acepta el correo) y formato del usuario', async () => {
  const por = async (u) => (await call('POST', '/api/login', null, { usuario: u, password: 'Tablero2026*' }, { 'x-forwarded-for': '10.1.1.1' })).s;
  assert.equal(await por('admin'), 200); assert.equal(await por('ADMIN'), 200); assert.equal(await por('admin@tablero.test'), 200); assert.equal(await por('operador'), 200); assert.equal(await por('noexiste'), 401);
  assert.equal((await call('POST', '/api/usuarios', admin, { nombre: 'Sin usuario', id_rol: 2, password: 'ClaveSegura1' })).s, 400);
  assert.equal((await call('POST', '/api/usuarios', admin, { nombre: 'Malo', usuario: 'a b', id_rol: 2, password: 'ClaveSegura1' })).s, 400);
  const c = await call('POST', '/api/usuarios', admin, { nombre: 'Sin correo', usuario: 'sin.correo', id_rol: 2, password: 'ClaveSegura1' });
  assert.equal(c.s, 201); assert.equal(c.j.correo, null);
  assert.equal((await call('POST', '/api/usuarios', admin, { nombre: 'Repetido', usuario: 'SIN.CORREO', id_rol: 2, password: 'ClaveSegura1' })).s, 409);
});
test('usuarios: editar, eliminar sin historial, desactivar con historial y proteger al administrador', async () => {
  const c = await call('POST', '/api/usuarios', admin, { nombre: 'Temporal', usuario: 'temporal', id_rol: 2, password: 'ClaveSegura1' });
  const e = await call('PUT', '/api/usuarios/' + c.j.id_usuario, admin, { nombre: 'Temporal Editado', usuario: 'temporal', id_rol: 2, estado: true });
  assert.equal(e.s, 200); assert.equal(e.j.nombre, 'Temporal Editado');
  const p = await call('PUT', '/api/usuarios/' + c.j.id_usuario, admin, { password: 'OtraClave123' }); assert.equal(p.s, 200);
  assert.equal((await call('POST', '/api/login', null, { usuario: 'temporal', password: 'OtraClave123' }, { 'x-forwarded-for': '10.1.1.2' })).s, 200);
  const d = await call('DELETE', '/api/usuarios/' + c.j.id_usuario, admin);
  assert.equal(d.s, 200); assert.equal(d.j.desactivado, true); assert.match(d.j.mensaje, /se desactiv/);
  assert.equal((await call('POST', '/api/login', null, { usuario: 'temporal', password: 'OtraClave123' }, { 'x-forwarded-for': '10.1.1.2' })).s, 401);
  const s = await call('POST', '/api/usuarios', admin, { nombre: 'Sin historial', usuario: 'sinhistorial', id_rol: 2, password: 'ClaveSegura1' });
  assert.equal((await call('DELETE', '/api/usuarios/' + s.j.id_usuario, admin)).j.desactivado, undefined);
  assert.equal((await call('GET', '/api/usuarios/' + s.j.id_usuario, admin)).s, 404);
  assert.equal((await call('DELETE', '/api/usuarios/1', admin)).s, 409);
  assert.equal((await call('PUT', '/api/usuarios/1', admin, { estado: false })).s, 409);
  assert.equal((await call('PUT', '/api/usuarios/1', admin, { id_rol: 2 })).s, 409);
  assert.equal((await call('DELETE', '/api/usuarios/2', oper)).s, 403);
  assert.equal((await call('DELETE', '/api/usuarios/9999', admin)).s, 404);
});
test('límite de intentos de inicio de sesión (429)', async () => {
  let ultimo = 0;
  for (let i = 0; i < 12; i++) ultimo = (await call('POST', '/api/login', null, { correo: 'x@x.co', password: 'mala' }, { 'x-forwarded-for': '10.9.9.9' })).s;
  assert.equal(ultimo, 429);
});
