const HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' };

function cabeceras(res) { Object.entries(HEADERS).forEach(([k, v]) => res.setHeader(k, v)); }

function send(res, code, body) {
  res.statusCode = code;
  cabeceras(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sendBin(res, buf, type, nombre) {
  res.statusCode = 200;
  cabeceras(res);
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
  res.end(buf);
}

async function readJson(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) throw new Error('payload'); }
  return raw ? JSON.parse(raw) : {};
}

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

module.exports = { send, sendBin, readJson, HttpError };
