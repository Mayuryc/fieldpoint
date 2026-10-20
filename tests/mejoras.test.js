process.env.SCRYPT_N = '1024';
process.env.JWT_SECRET = 'secreto-de-pruebas';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { createServer } = require('../server');
const db = require('../lib/db');
const lic = require('../lib/license');
const backup = require('../lib/backup');

let server; let base; let admin; let oper;
const call = async (method, path, token, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const tipo = r.headers.get('content-type') || '';
  const j = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { s: r.status, j, tipo };
};
const login = async (c) => (await call('POST', '/api/login', null, { correo: c, password: 'FieldPoint2026*' })).j.token;
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ejemplo = { metodo: 'Transferencia', cliente_nombre: 'Juan Pérez', items: [{ tipo: 'cancha', id_cancha: 1, cantidad: 1 }, { tipo: 'mesa', descripcion: 'Mesa 3', precio_unitario: 10000, cantidad: 1 }, { tipo: 'consumo', id_producto: 1, cantidad: 2 }, { tipo: 'consumo', id_producto: 7, cantidad: 1 }] };

before(async () => {
  db.reset(); server = createServer().listen(0); await new Promise((r) => server.once('listening', r));
  base = 'http://localhost:' + server.address().port; admin = await login('admin@fieldpoint.co'); oper = await login('operador@fieldpoint.co');
});
after(() => server.close());

test('configuración del negocio: solo el administrador edita; logo validado', async () => {
  assert.equal((await call('GET', '/api/negocio', oper)).s, 200);
  assert.equal((await call('PUT', '/api/negocio', oper, { nombre: 'X' })).s, 403);
  assert.equal((await call('PUT', '/api/negocio', admin, { nombre: '' })).s, 400);
  assert.equal((await call('PUT', '/api/negocio', admin, { logo: 'http://x/logo.png' })).s, 400);
  const r = await call('PUT', '/api/negocio', admin, { nombre: 'Complejo Deportivo "El Golazo"', nit: '123456789-0', direccion: 'Calle 10 #5-20', logo: PNG });
  assert.equal(r.s, 200); assert.equal(r.j.nombre, 'Complejo Deportivo "El Golazo"'); assert.equal(r.j.logo, PNG);
  assert.equal((await call('PUT', '/api/negocio', admin, { nombre: 'Cancha Sintética Fútbol 10', logo: null })).s, 200);
});
test('comprobante del ejemplo: cancha + mesa + consumos = $88.000, con descuento de inventario', async () => {
  const antes = (await call('GET', '/api/productos/1', admin)).j.stock_actual;
  const r = await call('POST', '/api/comprobantes', oper, ejemplo);
  assert.equal(r.s, 201); assert.equal(Number(r.j.total), 88000); assert.equal(r.j.numero, 1); assert.equal(r.j.items.length, 4);
  assert.equal((await call('GET', '/api/productos/1', admin)).j.stock_actual, antes - 2);
  const mov = await db.query("SELECT cantidad, referencia FROM movimientos_inventario WHERE referencia='Comprobante 1' AND id_producto=1");
  assert.equal(mov.rows[0].cantidad, 2);
  const r2 = await call('POST', '/api/comprobantes', oper, { ...ejemplo, items: [ejemplo.items[2]] });
  assert.equal(r2.j.numero, 2); assert.equal(Number(r2.j.total), 8000);
});
test('comprobante: validaciones y existencias', async () => {
  assert.equal((await call('POST', '/api/comprobantes', admin, { ...ejemplo, metodo: 'Cripto' })).s, 400);
  assert.equal((await call('POST', '/api/comprobantes', admin, { metodo: 'Efectivo', items: [] })).s, 400);
  assert.equal((await call('POST', '/api/comprobantes', admin, { metodo: 'Efectivo', items: [{ tipo: 'raro', descripcion: 'x', precio_unitario: 1, cantidad: 1 }] })).s, 400);
  assert.equal((await call('POST', '/api/comprobantes', admin, { metodo: 'Efectivo', items: [{ tipo: 'consumo', id_producto: 1, cantidad: 0 }] })).s, 400);
  assert.equal((await call('POST', '/api/comprobantes', admin, { metodo: 'Efectivo', items: [{ tipo: 'consumo', id_producto: 5, cantidad: 999 }] })).s, 409);
  assert.equal((await call('POST', '/api/comprobantes', admin, { metodo: 'Efectivo', items: [{ tipo: 'consumo', id_producto: 999, cantidad: 1 }] })).s, 400);
  assert.equal((await call('POST', '/api/comprobantes', admin, { metodo: 'Efectivo', items: [{ tipo: 'cancha', id_cancha: 999, cantidad: 1 }] })).s, 400);
  assert.equal((await call('POST', '/api/comprobantes', admin, { metodo: 'Efectivo', items: [{ tipo: 'otro', descripcion: '', cantidad: 1 }] })).s, 400);
  assert.equal((await call('POST', '/api/comprobantes', admin, { metodo: 'Efectivo', items: [{ tipo: 'consumo', id_producto: 5, cantidad: 999 }, { tipo: 'consumo', id_producto: 1, cantidad: 1 }] })).s, 409);
  assert.equal(Number((await call('GET', '/api/productos/1', admin)).j.stock_actual), 20, 'una operación fallida no descuenta inventario (transacción)');
});
test('promociones: CRUD del administrador y descuento aplicado en el comprobante', async () => {
  assert.equal((await call('POST', '/api/promociones', oper, { nombre: 'X' })).s, 403);
  const p = await call('POST', '/api/promociones', admin, { nombre: '20 % en papas', tipo: 'Porcentaje', valor: 20, estado: true });
  assert.equal(p.s, 201);
  const c = await call('POST', '/api/comprobantes', oper, { metodo: 'Efectivo', items: [{ tipo: 'consumo', id_producto: 5, cantidad: 1, id_promocion: p.j.id_promocion }] });
  assert.equal(c.s, 201); assert.equal(Number(c.j.total), 2400); assert.equal(Number(c.j.descuento), 600);
  await call('PUT', '/api/promociones/' + p.j.id_promocion, admin, { estado: false });
  assert.equal((await call('POST', '/api/comprobantes', oper, { metodo: 'Efectivo', items: [{ tipo: 'consumo', id_producto: 5, cantidad: 1, id_promocion: p.j.id_promocion }] })).s, 400);
  const v = await call('POST', '/api/promociones', admin, { nombre: '$1.000 menos', tipo: 'Valor', valor: 1000, estado: true });
  const c2 = await call('POST', '/api/comprobantes', oper, { metodo: 'Efectivo', items: [{ tipo: 'consumo', id_producto: 3, cantidad: 1, id_promocion: v.j.id_promocion }] });
  assert.equal(Number(c2.j.total), 4000);
});
test('tirilla y factura en PDF, con el logo del negocio', async () => {
  await call('PUT', '/api/negocio', admin, { logo: PNG });
  for (const f of ['', '?formato=factura']) {
    const r = await call('GET', '/api/comprobantes/1/pdf' + f, oper);
    assert.equal(r.s, 200); assert.equal(r.tipo, 'application/pdf'); assert.equal(r.j.subarray(0, 4).toString(), '%PDF'); assert.ok(r.j.length > 1500);
  }
  assert.equal((await call('GET', '/api/comprobantes/999/pdf', oper)).s, 404);
  await call('PUT', '/api/negocio', admin, { logo: null });
  assert.equal((await call('GET', '/api/comprobantes/1/pdf', oper)).s, 200);
  const l = await call('GET', '/api/comprobantes?fecha=' + hoy, oper); assert.ok(l.j.total >= 3);
  assert.equal((await call('GET', '/api/comprobantes/1', oper)).j.items[0].tipo, 'cancha');
});
test('reporte diario: ventas por tipo, cancha, mesa, consumos y método de pago', async () => {
  const r = (await call('GET', '/api/reportes/diario?fecha=' + hoy, oper)).j;
  assert.ok(r.total >= 88000); assert.ok(r.comprobantes >= 3);
  assert.ok(r.porTipo.find((x) => x.tipo === 'cancha').total >= 50000);
  assert.equal(r.porMesa[0].nombre, 'Mesa 3'); assert.ok(r.porCancha[0].nombre.includes('Cancha sintética'));
  assert.ok(r.porProducto.find((x) => x.nombre === 'Pizza').cantidad >= 1);
  assert.ok(r.porMetodo.find((x) => x.metodo === 'Transferencia').total >= 88000);
  assert.equal(r.porDia.length, 1);
});
test('reportes semanal y mensual: rangos, permisos y exportación PDF y Excel', async () => {
  assert.equal((await call('GET', '/api/reportes/semanal', oper)).s, 403);
  assert.equal((await call('GET', '/api/reportes/mensual', oper)).s, 403);
  assert.equal((await call('GET', '/api/reportes/anual', admin)).s, 404);
  assert.equal((await call('GET', '/api/reportes/diario?fecha=hoy', admin)).s, 400);
  const s = (await call('GET', '/api/reportes/semanal?fecha=2026-10-15', admin)).j; assert.deepEqual([s.desde, s.hasta], ['2026-10-09', '2026-10-15']);
  const m = (await call('GET', '/api/reportes/mensual?fecha=2026-02-10', admin)).j; assert.deepEqual([m.desde, m.hasta], ['2026-02-01', '2026-02-28']);
  const pdf = await call('GET', '/api/reportes/semanal?formato=pdf', admin); assert.equal(pdf.j.subarray(0, 4).toString(), '%PDF');
  const x = await call('GET', '/api/reportes/mensual?formato=xlsx', admin); assert.equal(x.s, 200);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x.j);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Resumen', 'Comprobantes', 'Consumos', 'Por día']);
  assert.equal(wb.getWorksheet('Resumen').getRow(7).getCell(1).value, 'Ventas totales');
  assert.equal(wb.getWorksheet('Comprobantes').getRow(6).getCell(8).value, 'Total');
  assert.equal((await call('GET', '/api/reportes/diario?formato=pdf', oper)).s, 200);
  assert.equal((await call('GET', '/api/reportes/diario?formato=xlsx', oper)).s, 200);
});
test('reserva rápida: cliente por celular, reserva, tirilla y recordatorio de WhatsApp (simulado)', async () => {
  const b = { nombre: 'Juan Pérez', telefono: '300 123 4567', id_cancha: 1, fecha: '2026-10-10', hora_inicio: '18:00', hora_fin: '19:00', metodo: 'Transferencia' };
  const r = await call('POST', '/api/reservas/rapida', oper, b);
  assert.equal(r.s, 201); assert.equal(r.j.reserva.estado, 'Reservada'); assert.equal(Number(r.j.comprobante.total), 50000); assert.equal(r.j.comprobante.id_reserva, r.j.reserva.id_reserva);
  assert.equal(r.j.notificacion.estado, 'simulado');
  assert.match(r.j.notificacion.mensaje, /Hola Juan Pérez, tu reserva está confirmada/); assert.match(r.j.notificacion.mensaje, /Fecha: 10\/10\/2026 - 6:00 PM/); assert.match(r.j.notificacion.mensaje, /Pago: Transferencia/);
  assert.equal((await db.query("SELECT telefono FROM clientes WHERE nombre='Juan Pérez'")).rows[0].telefono, '3001234567');
  assert.equal((await call('POST', '/api/reservas/rapida', oper, { ...b, hora_inicio: '18:30', hora_fin: '19:30' })).s, 409);
  assert.equal((await call('POST', '/api/reservas/rapida', oper, { ...b, telefono: '123' })).s, 400);
  assert.equal((await call('POST', '/api/reservas/rapida', oper, { ...b, nombre: ' ' })).s, 400);
  assert.equal((await call('POST', '/api/reservas/rapida', oper, { ...b, hora_fin: '17:00' })).s, 400);
  assert.equal((await call('POST', '/api/reservas/rapida', oper, { ...b, id_cancha: 99, fecha: '2026-10-11' })).s, 400);
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM notificaciones')).rows[0].n >= 1, true);
});
test('fidelización: después de 7 reservas pagadas, la 8.ª es gratis', async () => {
  const cuerpo = (d) => ({ nombre: 'Cliente Fiel', telefono: '3109998877', id_cancha: 1, fecha: `2026-11-${String(d).padStart(2, '0')}`, hora_inicio: '10:00', hora_fin: '11:00', metodo: 'Efectivo' });
  for (let d = 1; d <= 7; d++) { const r = await call('POST', '/api/reservas/rapida', oper, cuerpo(d)); assert.equal(Number(r.j.comprobante.total), 50000); assert.equal(r.j.reserva_gratis, false); }
  const id = (await db.query("SELECT id_cliente FROM clientes WHERE telefono='3109998877'")).rows[0].id_cliente;
  const f = (await call('GET', `/api/clientes/${id}/fidelizacion`, oper)).j; assert.equal(f.reservas, 7); assert.equal(f.proxima_gratis, true);
  const g = await call('POST', '/api/reservas/rapida', oper, cuerpo(8)); assert.equal(g.j.reserva_gratis, true); assert.equal(Number(g.j.comprobante.total), 0); assert.match(g.j.notificacion.mensaje, /Cliente Fiel/);
  const h = (await call('GET', `/api/clientes/${id}/historial`, oper)).j;
  assert.equal(h.reservas.length, 8); assert.equal(h.comprobantes.length, 8); assert.equal(h.frecuente, true); assert.equal(h.fidelizacion.proxima_gratis, false);
  const fr = (await call('GET', '/api/clientes/frecuentes', oper)).j.data; assert.equal(fr[0].nombre, 'Cliente Fiel'); assert.equal(fr[0].frecuente, true);
  assert.equal((await call('GET', '/api/clientes/999/historial', oper)).s, 404);
});
test('WhatsApp por Twilio: arma la petición correcta y reporta el envío', async () => {
  const original = global.fetch; const llamadas = [];
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'token', TWILIO_WHATSAPP_FROM: '+14155238886' });
  global.fetch = async (url, o) => { if (String(url).includes('twilio.com')) { llamadas.push({ url: String(url), body: String(o.body), auth: o.headers.Authorization }); return { ok: true }; } return original(url, o); };
  try {
    const id = (await db.query('SELECT id_reserva FROM reservas ORDER BY id_reserva LIMIT 1')).rows[0].id_reserva;
    const r = await call('POST', `/api/reservas/${id}/recordatorio`, oper);
    assert.equal(r.s, 200); assert.equal(r.j.estado, 'enviado'); assert.equal(r.j.canal, 'twilio');
    assert.match(llamadas[0].url, /Accounts\/ACtest\/Messages\.json/); assert.match(decodeURIComponent(llamadas[0].body), /To=whatsapp:\+573001234567/); assert.match(llamadas[0].auth, /^Basic /);
    global.fetch = async (url, o) => { if (String(url).includes('twilio.com')) throw new Error('sin red'); return original(url, o); };
    assert.equal((await call('POST', `/api/reservas/${id}/recordatorio`, oper)).j.estado, 'error');
  } finally { global.fetch = original; for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM']) delete process.env[k]; }
  assert.equal((await call('POST', '/api/reservas/9999/recordatorio', oper)).s, 404);
});
test('alertas de inventario por stock bajo', async () => {
  const a = (await call('GET', '/api/inventario/alertas', oper)).j; const n = a.data.map((p) => p.nombre);
  assert.ok(n.includes('Papas')); assert.ok(n.includes('Agua')); assert.ok(!n.includes('Cerveza'));
});
test('código QR para pago por transferencia', async () => {
  const r = await call('GET', '/api/qr', oper); assert.match(r.j.dataUrl, /^data:image\/png;base64,/);
  assert.match((await call('GET', '/api/qr?texto=https://pago.test/1', oper)).j.dataUrl, /^data:image\/png/);
});
test('auditoría: quién, cuándo y qué acción; solo el administrador la consulta', async () => {
  assert.equal((await call('GET', '/api/auditoria', oper)).s, 403);
  const a = (await call('GET', '/api/auditoria?limit=200', admin)).j.data;
  assert.ok(a.some((x) => x.accion === 'LOGIN' && x.usuario)); assert.ok(a.some((x) => /^INSERT #\d+/.test(x.accion) && x.tabla_afectada === 'comprobantes')); assert.ok(a.every((x) => x.fecha_hora));
});
test('respaldo y restauración de la base de datos', async () => {
  assert.equal((await call('GET', '/api/respaldo', oper)).s, 403);
  const r = await call('GET', '/api/respaldo', admin); const dump = r.j;
  assert.equal(dump.app, 'FieldPoint'); assert.ok(Object.keys(dump.tablas).length >= 22); assert.ok(dump.tablas.comprobantes.length >= 3);
  const precio = dump.tablas.productos.find((p) => p.id_producto === 1).precio_venta;
  await call('PUT', '/api/productos/1', admin, { precio_venta: 99999 });
  await backup.restaurar(dump);
  assert.equal((await call('GET', '/api/productos/1', admin)).j.precio_venta, precio);
  assert.equal((await call('POST', '/api/productos', admin, { nombre: 'Después de restaurar', precio_venta: 1000 })).s, 201);
  assert.equal((await call('POST', '/api/comprobantes', admin, { metodo: 'Efectivo', items: [{ tipo: 'otro', descripcion: 'x', precio_unitario: 1, cantidad: 1 }] })).j.numero, dump.tablas.comprobantes.length + 1);
  await assert.rejects(() => backup.restaurar({ app: 'otra' }), /no válido/);
  const fs = require('fs'); const os = require('os'); const path = require('path'); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-'));
  const f = await backup.respaldarEnCarpeta(dir, 2); assert.ok(fs.existsSync(f)); assert.equal(await backup.respaldarEnCarpeta(dir, 2), f);
});
test('licencia única firmada: activación, bloqueo sin licencia y rechazo de licencias ajenas', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const otra = crypto.generateKeyPairSync('ed25519');
  process.env.LICENSE_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }); process.env.REQUIRE_LICENSE = '1';
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
  try {
    assert.equal((await call('GET', '/api/productos', admin)).s, 402);
    assert.equal((await call('GET', '/api/health')).s, 200);
    const estado = (await call('GET', '/api/licencia', admin)).j; assert.equal(estado.activa, false); assert.equal(estado.requerida, true); assert.ok(estado.hardware_id);
    assert.equal((await call('POST', '/api/licencia/activar', oper, { clave: 'x' })).s, 403);
    assert.equal((await call('POST', '/api/licencia/activar', admin, { clave: 'basura' })).s, 400);
    assert.equal((await call('POST', '/api/licencia/activar', admin, { clave: lic.sign({ negocio: 'X', nit: '1', hardware: '*' }, otra.privateKey.export({ type: 'pkcs8', format: 'pem' })) })).s, 400);
    assert.equal((await call('POST', '/api/licencia/activar', admin, { clave: lic.sign({ negocio: 'X', nit: '1', hardware: 'otro-equipo' }, priv) })).s, 400);
    const ok = await call('POST', '/api/licencia/activar', admin, { clave: lic.sign({ negocio: 'Cancha Sintética Fútbol 10', nit: '123456789-0', hardware: lic.hardwareId() }, priv) });
    assert.equal(ok.s, 200); assert.equal(ok.j.tipo, 'unica');
    assert.equal((await call('GET', '/api/productos', admin)).s, 200);
    assert.equal((await call('GET', '/api/licencia', oper)).j.negocio, 'Cancha Sintética Fútbol 10');
  } finally { delete process.env.LICENSE_PUBLIC_KEY; delete process.env.REQUIRE_LICENSE; }
});
test('numeración consecutiva sin repetirse con 25 cobros simultáneos', async () => {
  const cobros = await Promise.all(Array.from({ length: 25 }, () => call('POST', '/api/comprobantes', admin, { metodo: 'Efectivo', items: [{ tipo: 'otro', descripcion: 'Cobro simultáneo', precio_unitario: 1000, cantidad: 1 }] })));
  assert.ok(cobros.every((c) => c.s === 201), 'todos los cobros se registran: ' + cobros.map((c) => c.s).join(','));
  const numeros = cobros.map((c) => Number(c.j.numero)).sort((a, b) => a - b);
  assert.equal(new Set(numeros).size, 25, 'ningún número se repite');
  assert.equal(numeros[24] - numeros[0], 24, 'la numeración es consecutiva');
});
