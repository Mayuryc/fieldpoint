// Restauración desde un respaldo JSON: node scripts/restore.js <archivo.json>   (reemplaza TODOS los datos)
const fs = require('fs');
const { restaurar } = require('../lib/backup');
if (!process.argv[2]) { console.error('Uso: node scripts/restore.js <archivo.json>'); process.exit(1); }
restaurar(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))).then(() => { console.log('Restauración completada.'); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
