// Licencia única firmada con Ed25519: el vendedor firma con su clave privada; la aplicación solo trae la clave pública.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const b64 = (b) => Buffer.from(b).toString('base64url');

const publicKey = () => process.env.LICENSE_PUBLIC_KEY || fs.readFileSync(path.join(__dirname, 'license-public.pem'), 'utf8');

/** Identificador de equipo para licencias instaladas en un computador. */
function hardwareId() {
  return crypto.createHash('sha256').update(`${os.hostname()}|${os.platform()}|${os.cpus()[0]?.model || ''}`).digest('hex').slice(0, 16);
}

function sign(payload, privatePem) {
  const body = b64(JSON.stringify({ v: 1, tipo: 'unica', emitida: new Date().toISOString().slice(0, 10), ...payload }));
  return `${body}.${b64(crypto.sign(null, Buffer.from(body), privatePem))}`;
}

/** Devuelve { ok, payload } o { ok:false, error }. */
function verify(clave, hw = hardwareId()) {
  try {
    const [body, sig] = String(clave).trim().split('.');
    if (!body || !sig) return { ok: false, error: 'Formato de licencia no válido' };
    if (!crypto.verify(null, Buffer.from(body), publicKey(), Buffer.from(sig, 'base64url'))) return { ok: false, error: 'Firma de licencia no válida' };
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.hardware !== '*' && payload.hardware !== hw) return { ok: false, error: 'La licencia pertenece a otro equipo' };
    return { ok: true, payload };
  } catch { return { ok: false, error: 'Licencia no válida' }; }
}

module.exports = { sign, verify, hardwareId };
