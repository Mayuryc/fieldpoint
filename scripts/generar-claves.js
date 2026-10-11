// Herramienta del vendedor: crea el par de claves. Guarde licencia-privada.pem en un lugar seguro (NO se distribuye).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync('licencia-privada.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(path.join(__dirname, '..', 'lib', 'license-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
console.log('Claves creadas: licencia-privada.pem (secreta) y lib/license-public.pem (se distribuye con la aplicación).');
