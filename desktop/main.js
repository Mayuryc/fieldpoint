// Aplicación de escritorio (Electron): servidor local + PostgreSQL embebido (PGlite) con datos en la carpeta del usuario.
const { app, BrowserWindow, dialog } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function iniciar() {
  const datos = app.getPath('userData');
  const primeraVez = !fs.existsSync(path.join(datos, 'datos'));
  fs.mkdirSync(datos, { recursive: true });
  const claveFile = path.join(datos, 'secreto.key');
  if (!fs.existsSync(claveFile)) fs.writeFileSync(claveFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  const clave = primeraVez ? (process.env.FP_PASSWORD_INICIAL || crypto.randomBytes(6).toString('base64url')) : null;
  Object.assign(process.env, {
    FP_DATA_DIR: path.join(datos, 'datos'), AUTO_BACKUP_DIR: path.join(datos, 'respaldos'), REQUIRE_LICENSE: '1',
    JWT_SECRET: fs.readFileSync(claveFile, 'utf8'), ...(clave ? { SEED_PASSWORD: clave } : {}),
  });
  const { createServer, iniciarRespaldos } = require('../server');
  const srv = createServer().listen(0, '127.0.0.1', async () => {
    iniciarRespaldos();
    const win = new BrowserWindow({ width: 1280, height: 800, title: 'FieldPoint', icon: path.join(__dirname, '..', 'public', 'assets', 'icon.png'), webPreferences: { contextIsolation: true, nodeIntegration: false } });
    win.removeMenu();
    await win.loadURL(`http://127.0.0.1:${srv.address().port}/`);
    if (clave) dialog.showMessageBox(win, { type: 'info', title: 'Primer inicio', message: 'Contraseña inicial de los usuarios', detail: `admin@fieldpoint.co y operador@fieldpoint.co\nContraseña: ${clave}\nCámbiela desde el módulo Usuarios y active su licencia en Negocio y licencia.` });
  });
}

app.whenReady().then(iniciar);
app.on('window-all-closed', () => app.quit());
