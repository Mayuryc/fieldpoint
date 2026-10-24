// Pruebas de interfaz con Selenium WebDriver (Chrome). Ejecutar con: BASE_URL=https://<proyecto>.vercel.app npm run test:selenium
// Los identificadores CP coinciden con la verificación equivalente de tests/ui_check_playwright.py.
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PASS = process.env.FP_PASSWORD || 'Tablero2026*';
let d;
const q = (id) => By.css(`[data-testid="${id}"]`);
const wait = (loc) => d.wait(until.elementLocated(loc), 10000);
const rows = async (id) => (await d.findElements(By.css(`[data-testid="${id}"] tr`))).length;
async function login(usuario, pw) {
  await d.get(BASE);
  const c = await wait(q('login-usuario')); await c.clear(); await c.sendKeys(usuario);
  await d.findElement(q('password')).sendKeys(pw);
  await clic(q('login-submit'));
}

// Espera a que un elemento contenga un texto; tolera que la ventana se vuelva a dibujar (elemento obsoleto).
const esperaTexto = (id, txt, ms = 10000) => d.wait(async () => { try { return (await d.findElement(q(id)).getText()).includes(txt); } catch { return false; } }, ms);

// Clic tolerante: reintenta si la tabla o la ventana se vuelven a dibujar justo en ese instante.
async function clic(loc) {
  for (let i = 0; i < 6; i++) {
    try { const e = await wait(loc); await d.wait(until.elementIsVisible(e), 5000); await e.click(); return; } catch (err) {
      if (!/Stale|Intercepted|NoSuchElement/.test(err.name)) throw err;
      await d.sleep(300);
    }
  }
  throw new Error('No se pudo hacer clic en ' + loc);
}
// Escribe en un campo visible; si la ventana se vuelve a dibujar, reintenta con el campo nuevo.
async function escribir(loc, valor) {
  for (let i = 0; i < 8; i++) {
    try {
      const e = await d.wait(async () => { try { const x = await d.findElement(loc); return (await x.isDisplayed()) ? x : false; } catch { return false; } }, 8000);
      await e.clear(); await e.sendKeys(valor); return;
    } catch (err) { if (!/Stale|NotInteractable|Intercepted/.test(err.name)) throw err; await d.sleep(250); }
  }
  throw new Error('No se pudo escribir en ' + loc);
}
async function elegir(id, textoInicial) {
  const sel = await d.findElement(q(id));
  for (const o of await sel.findElements(By.css('option'))) if ((await o.getText()).startsWith(textoInicial)) { await o.click(); return; }
}

before(async () => {
  const o = new chrome.Options().addArguments('--headless=new', '--no-sandbox', '--window-size=1280,900');
  if (process.env.CHROME_BIN) o.setChromeBinaryPath(process.env.CHROME_BIN); // navegador en una ruta distinta (opcional)
  const b = new Builder().forBrowser('chrome').setChromeOptions(o);
  if (process.env.CHROMEDRIVER_PATH) b.setChromeService(new chrome.ServiceBuilder(process.env.CHROMEDRIVER_PATH)); // controlador en una ruta distinta (opcional)
  d = await b.build();
});
after(async () => { if (d) await d.quit(); });
afterEach(async (t) => { if (/^CP3[01]/.test(t.name)) return; /* CP30 a CP34 comparten la misma ventana */ try { await d.executeScript("const m=document.getElementById('mo'); if (m) m.hidden=true;"); } catch { /* sin página cargada */ } });

test('CP01 login inválido muestra el mensaje de error', async () => {
  await login('admin', 'incorrecta');
  await d.wait(until.elementTextIs(await wait(q('login-error')), 'Credenciales no válidas'), 5000);
});
test('CP02 login válido abre el sistema con el rol Administrador', async () => {
  await login('admin', PASS);
  await d.wait(until.elementTextContains(await wait(q('usuario')), 'Administrador'), 8000);
});
test('CP03 consultar: la tabla de productos muestra registros', async () => {
  await (await wait(q('tab-productos'))).click();
  await d.wait(async () => (await rows('tabla')) >= 7, 8000);
});
test('CP05 insertar un producto nuevo', async () => {
  await clic(q('nuevo'));
  await wait(By.id('f_nombre')); await d.findElement(By.id('f_nombre')).sendKeys('Hamburguesa Selenium');
  await d.findElement(By.id('f_precio_venta')).sendKeys('12000');
  await clic(q('guardar'));
  await d.wait(until.elementTextContains(await d.findElement(q('tabla')), 'Hamburguesa Selenium'), 8000);
});
test('CP06 buscar filtra los resultados', async () => {
  await d.findElement(q('buscar')).sendKeys('Selenium');
  await d.wait(async () => (await rows('tabla')) === 1, 8000);
});
test('CP07 actualizar el precio del producto', async () => {
  await clic(q('editar'));
  await escribir(By.id('f_precio_venta'), '13500');
  await clic(q('guardar'));
  await esperaTexto('tabla', '13500');
});
test('CP08 eliminar el producto', async () => {
  d.executeScript('window.confirm = () => true');
  await clic(q('eliminar'));
  await d.wait(async () => !(await d.findElement(q('tabla')).getText()).includes('Selenium'), 8000);
});
test('CP09 integridad: no deja eliminar una categoría con productos', async () => {
  await clic(q('tab-categorias'));
  await d.wait(async () => (await rows('tabla')) >= 1, 8000);
  d.executeScript('window.confirm = () => true');
  await clic(q('eliminar'));
  await d.wait(until.elementTextContains(await wait(By.id('toast')), 'relacionados'), 5000);
});
test('CP10 cobrar: cancha + mesa + 2 gaseosas + pizza suman $ 88.000', async () => {
  await clic(q('tab-cobrar'));
  await wait(q('agregar'));
  await elegir('tipo-item', 'Cancha'); await clic(q('agregar'));
  await elegir('tipo-item', 'Mesa'); await d.findElement(q('descripcion')).sendKeys('Mesa 3'); await d.findElement(q('valor')).sendKeys('10000'); await clic(q('agregar'));
  await elegir('tipo-item', 'Consumo'); await elegir('producto', 'Gaseosa'); const c = await d.findElement(q('cantidad')); await c.clear(); await c.sendKeys('2'); await clic(q('agregar'));
  await elegir('producto', 'Pizza'); await c.clear(); await c.sendKeys('1'); await clic(q('agregar'));
  await d.wait(until.elementTextContains(await d.findElement(q('total')), '88.000'), 5000);
  await elegir('metodo', 'Transferencia');
  await wait(q('qr'));
});
test('CP12 se genera el comprobante con su número', async () => {
  await clic(q('generar'));
  await d.wait(until.elementTextContains(await wait(q('resultado')), 'Comprobante No. 000001'), 8000);
});
test('CP14 reserva rápida genera el mensaje de WhatsApp', async () => {
  await clic(q('tab-rapida'));
  await (await wait(q('r-nombre'))).sendKeys('Juan Pérez'); await d.findElement(q('r-celular')).sendKeys('3001234567');
  await clic(q('r-generar'));
  await d.wait(until.elementTextContains(await wait(q('r-mensaje')), 'tu reserva está confirmada'), 8000);
});
test('CP17 el reporte diario suma las ventas del día', async () => {
  await clic(q('tab-reportes'));
  await d.wait(until.elementTextContains(await wait(q('kpis')), '138.000'), 8000);
});
test('CP30 mesas: marcar la mesa 1 como ocupada con un cliente abre el detalle', async () => {
  await clic(q('tab-mesas'));
  await clic(q('mesa-abrir-1'));
  await wait(q('ocupar-cliente')); await elegir('ocupar-cliente', 'Los Halcones');
  await clic(q('ocupar-confirmar'));
  await wait(q('consumos-total'));
});
test('CP31 mesas: los consumos se acumulan en la mesa ($ 28.000)', async () => {
  await wait(q('consumo-producto')); await elegir('consumo-producto', 'Gaseosa'); await escribir(q('consumo-cantidad'), '2'); await clic(q('consumo-agregar'));
  await esperaTexto('consumos-total', '8.000');
  await elegir('consumo-producto', 'Pizza'); await escribir(q('consumo-cantidad'), '1'); await clic(q('consumo-agregar'));
  await esperaTexto('consumos-total', '28.000');
});
test('CP34 mesas: cerrar la mesa genera el comprobante y la deja libre', async () => {
  await clic(q('mesa-cerrar'));
  await wait(q('cerrar-metodo')); await elegir('cerrar-metodo', 'Transferencia'); await wait(q('qr'));
  await clic(q('cerrar-confirmar'));
  await esperaTexto('cierre-resultado', 'Comprobante No.');
  await d.findElement(By.css('#mf [data-close]')).click();
  await esperaTexto('mesa-estado-1', 'Libre');
});
test('CP25 el Operador no ve Auditoría, Negocio ni Usuarios', async () => {
  await clic(q('logout'));
  await login('operador', PASS);
  await wait(q('tab-cobrar'));
  for (const t of ['tab-auditoria', 'tab-negocio', 'tab-usuarios']) assert.equal((await d.findElements(q(t))).length, 0);
});
