// Herramienta del vendedor, tras confirmar el pago: node scripts/generar-licencia.js licencia-privada.pem "Negocio" "NIT" [hardware|*]
const fs = require('fs');
const { sign } = require('../lib/license');
const [key, negocio, nit, hardware = '*'] = process.argv.slice(2);
if (!key || !negocio) { console.error('Uso: node scripts/generar-licencia.js <clave-privada.pem> "<negocio>" "<nit>" [hardware|*]'); process.exit(1); }
console.log(sign({ negocio, nit, hardware }, fs.readFileSync(key, 'utf8')));
