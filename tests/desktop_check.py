"""Verificación de la aplicación de escritorio (Electron) controlada por Playwright mediante el puerto de depuración.
Uso (Linux con pantalla virtual):  python3 tests/desktop_check.py capturas
Requiere: npm i --no-save electron   y   xvfb"""
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = sys.argv[1] if len(sys.argv) > 1 else '.'
LIC = open(os.path.join(RAIZ, 'licencia-demo.txt')).read().strip()
CLAVE = 'Escritorio2026*'
T = lambda i: f'[data-testid={i}]'
res = []


def ok(nombre, cond):
    res.append((nombre, bool(cond)))
    print(('OK    ' if cond else 'FALLA ') + nombre, flush=True)


def lanzar():
    env = dict(os.environ, FP_PASSWORD_INICIAL=CLAVE)
    p = subprocess.Popen(['xvfb-run', '-a', 'npx', 'electron', '.', '--no-sandbox', '--remote-debugging-port=9444'], cwd=RAIZ, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(24)
    return p


def cerrar():
    subprocess.run(['pkill', '-x', 'electron'], check=False); time.sleep(2)
    subprocess.run(['pkill', '-x', 'Xvfb'], check=False); time.sleep(2)


def entrar(pg):
    pg.fill(T('login-usuario'), 'admin'); pg.fill(T('password'), CLAVE); pg.click(T('login-submit'))


p = lanzar()
with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp('http://127.0.0.1:9444'); pg = b.contexts[0].pages[0]; pg.set_viewport_size({'width': 1280, 'height': 800})
    entrar(pg); pg.wait_for_selector(T('lic-activar'))
    ok('ED1 Sin licencia, el sistema pide activarla', 'Active su licencia' in pg.inner_text('body')); pg.screenshot(path=SALIDA + '/ed_licencia.png')
    pg.fill(T('lic-clave'), 'clave-falsa'); pg.click(T('lic-activar')); pg.wait_for_timeout(600)
    ok('ED2 Una licencia falsa se rechaza', 'no válid' in pg.inner_text('#toast'))
    pg.fill(T('lic-clave'), LIC); pg.click(T('lic-activar')); pg.wait_for_selector(T('tab-cobrar'))
    ok('ED3 Con la licencia firmada se abre el sistema', True)
    pg.click(T('tab-productos')); pg.wait_for_selector(T('tabla') + ' tr'); pg.click(T('nuevo')); pg.fill('#f_nombre', 'Producto de escritorio'); pg.fill('#f_precio_venta', '7000'); pg.click(T('guardar')); pg.wait_for_timeout(900)
    ok('ED4 Se guarda un producto en la base local', 'Producto de escritorio' in pg.inner_text(T('tabla'))); pg.screenshot(path=SALIDA + '/ed_app.png')
    b.close()
cerrar()
datos = os.path.expanduser('~/.config/tablero')
ok('ED5 Se crean la carpeta de datos y el respaldo diario', os.path.isdir(datos + '/datos') and any(f.startswith('tablero_') for f in os.listdir(datos + '/respaldos')))
p = lanzar()
with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp('http://127.0.0.1:9444'); pg = b.contexts[0].pages[0]
    entrar(pg); pg.wait_for_selector(T('tab-cobrar'), timeout=20000)
    ok('ED6 Al reabrir, la licencia sigue activa (no la pide otra vez)', True)
    pg.click(T('tab-productos')); pg.wait_for_selector(T('tabla') + ' tr')
    ok('ED7 Al reabrir, los datos persisten', 'Producto de escritorio' in pg.inner_text(T('tabla')))
    b.close()
cerrar()
print(sum(1 for _, c in res if c), 'de', len(res))
json.dump(res, open(SALIDA + '/ed_results.json', 'w'))
