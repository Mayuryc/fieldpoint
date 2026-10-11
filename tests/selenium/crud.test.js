// Pruebas de interfaz con Selenium WebDriver (Chrome). Ejecutar con: BASE_URL=https://<proyecto>.vercel.app npm run test:selenium
// Los identificadores CP coinciden con la verificación equivalente de tests/ui_check_playwright.py.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PASS = process.env.FP_PASSWORD || 'FieldPoint2026*';
let d;
const q = (id) => By.css(`[data-testid="${id}"]`);
const wait = (loc) => d.wait(until.elementLocated(loc), 10000);
const rows = async (id) => (await d.findElements(By.css(`[data-testid="${id}"] tr`))).length;
async function login(correo, pw) {
  await d.get(BASE);
  const c = await wait(q('correo')); await c.clear(); await c.sendKeys(correo);
  await d.findElement(q('password')).sendKeys(pw);
  await d.findElement(q('login-submit')).click();
}
async function elegir(id, textoInicial) {
  const sel = await d.findElement(q(id));
  for (const o of await sel.findElements(By.css('option'))) if ((await o.getText()).startsWith(textoInicial)) { await o.click(); return; }
}

before(async () => {
  const o = new chrome.Options().addArguments('--headless=new', '--no-sandbox', '--window-size=1280,900');
  d = await new Builder().forBrowser('chrome').setChromeOptions(o).build();
});
after(async () => { if (d) await d.quit(); });

test('CP01 login inválido muestra el mensaje de error', async () => {
  await login('admin@fieldpoint.co', 'incorrecta');
  await d.wait(until.elementTextIs(await wait(q('login-error')), 'Credenciales no válidas'), 5000);
});
test('CP02 login válido abre el sistema con el rol Administrador', async () => {
  await login('admin@fieldpoint.co', PASS);
  await d.wait(until.elementTextContains(await wait(q('usuario')), 'Administrador'), 8000);
});
test('CP03 consultar: la tabla de productos muestra registros', async () => {
  await (await wait(q('tab-productos'))).click();
  await d.wait(async () => (await rows('tabla')) >= 7, 8000);
});
test('CP05 insertar un producto nuevo', async () => {
  await d.findElement(q('nuevo')).click();
  await wait(By.id('f_nombre')); await d.findElement(By.id('f_nombre')).sendKeys('Hamburguesa Selenium');
  await d.findElement(By.id('f_precio_venta')).sendKeys('12000');
  await d.findElement(q('guardar')).click();
  await d.wait(until.elementTextContains(await d.findElement(q('tabla')), 'Hamburguesa Selenium'), 8000);
});
test('CP06 buscar filtra los resultados', async () => {
  await d.findElement(q('buscar')).sendKeys('Selenium');
  await d.wait(async () => (await rows('tabla')) === 1, 8000);
});
test('CP07 actualizar el precio del producto', async () => {
  await d.findElement(q('editar')).click();
  const p = await wait(By.id('f_precio_venta')); await p.clear(); await p.sendKeys('13500');
  await d.findElement(q('guardar')).click();
  await d.wait(until.elementTextContains(await d.findElement(q('tabla')), '13500'), 8000);
});
test('CP08 eliminar el producto', async () => {
  d.executeScript('window.confirm = () => true');
  await d.findElement(q('eliminar')).click();
  await d.wait(async () => !(await d.findElement(q('tabla')).getText()).includes('Selenium'), 8000);
});
test('CP09 integridad: no deja eliminar una categoría con productos', async () => {
  await d.findElement(q('tab-categorias')).click();
  await d.wait(async () => (await rows('tabla')) >= 1, 8000);
  d.executeScript('window.confirm = () => true');
  await d.findElement(q('eliminar')).click();
  await d.wait(until.elementTextContains(await wait(By.id('toast')), 'relacionados'), 5000);
});
test('CP10 cobrar: cancha + mesa + 2 gaseosas + pizza suman $ 88.000', async () => {
  await d.findElement(q('tab-cobrar')).click();
  await wait(q('agregar'));
  await elegir('tipo-item', 'Cancha'); await d.findElement(q('agregar')).click();
  await elegir('tipo-item', 'Mesa'); await d.findElement(q('descripcion')).sendKeys('Mesa 3'); await d.findElement(q('valor')).sendKeys('10000'); await d.findElement(q('agregar')).click();
  await elegir('tipo-item', 'Consumo'); await elegir('producto', 'Gaseosa'); const c = await d.findElement(q('cantidad')); await c.clear(); await c.sendKeys('2'); await d.findElement(q('agregar')).click();
  await elegir('producto', 'Pizza'); await c.clear(); await c.sendKeys('1'); await d.findElement(q('agregar')).click();
  await d.wait(until.elementTextContains(await d.findElement(q('total')), '88.000'), 5000);
  await elegir('metodo', 'Transferencia');
  await wait(q('qr'));
});
test('CP12 se genera el comprobante con su número', async () => {
  await d.findElement(q('generar')).click();
  await d.wait(until.elementTextContains(await wait(q('resultado')), 'Comprobante No. 000001'), 8000);
});
test('CP14 reserva rápida genera el mensaje de WhatsApp', async () => {
  await d.findElement(q('tab-rapida')).click();
  await (await wait(q('r-nombre'))).sendKeys('Juan Pérez'); await d.findElement(q('r-celular')).sendKeys('3001234567');
  await d.findElement(q('r-generar')).click();
  await d.wait(until.elementTextContains(await wait(q('r-mensaje')), 'tu reserva está confirmada'), 8000);
});
test('CP17 el reporte diario suma las ventas del día', async () => {
  await d.findElement(q('tab-reportes')).click();
  await d.wait(until.elementTextContains(await wait(q('kpis')), '138.000'), 8000);
});
test('CP25 el Operador no ve Auditoría, Negocio ni Usuarios', async () => {
  await d.findElement(q('logout')).click();
  await login('operador@fieldpoint.co', PASS);
  await wait(q('tab-cobrar'));
  for (const t of ['tab-auditoria', 'tab-negocio', 'tab-usuarios']) assert.equal((await d.findElements(q(t))).length, 0);
});
