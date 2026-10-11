// Servidor local para desarrollo, pruebas y capturas: sirve /public y delega /api en la función de Vercel.
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('./api/index');
const backup = require('./lib/backup');

const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };

function createServer() {
  return http.createServer((req, res) => {
    if (req.url.startsWith('/api')) return handler(req, res);
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.normalize(path.join(PUB, rel === '/' ? 'index.html' : rel));
    if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('No encontrado'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    return fs.createReadStream(file).pipe(res);
  });
}

/** Copia diaria automática en AUTO_BACKUP_DIR (por ejemplo, la carpeta de datos de la aplicación de escritorio). */
function iniciarRespaldos() {
  const dir = process.env.AUTO_BACKUP_DIR;
  if (!dir) return null;
  const hacer = () => backup.respaldarEnCarpeta(dir).catch((e) => console.error('Respaldo:', e.message));
  hacer();
  return setInterval(hacer, 60 * 60 * 1000);
}

if (require.main === module) createServer().listen(process.env.PORT || 3000, () => { iniciarRespaldos(); console.log('FieldPoint en http://localhost:' + (process.env.PORT || 3000)); });
module.exports = { createServer, iniciarRespaldos };
