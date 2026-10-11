const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const COST = Number(process.env.SCRYPT_N) || 16384;

/** Hash de contraseña con scrypt y sal única por usuario. */
function hash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const key = crypto.scryptSync(password, salt, 64, { N: COST });
  return `scrypt$${COST}$${salt}$${key.toString('hex')}`;
}

/** Verificación en tiempo constante. */
function verify(password, stored) {
  const [alg, n, salt, hex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64, { N: Number(n) });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const sign = (u) => jwt.sign({ sub: u.id_usuario, rol: u.rol }, SECRET, { algorithm: 'HS256', expiresIn: '8h' });

function fromRequest(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  try { return jwt.verify(m[1], SECRET, { algorithms: ['HS256'] }); } catch { return null; }
}

module.exports = { hash, verify, sign, fromRequest };
