// Copia de seguridad manual o programada (cron / Programador de tareas): node scripts/backup.js [carpeta]
const { respaldarEnCarpeta } = require('../lib/backup');
respaldarEnCarpeta(process.argv[2] || process.env.AUTO_BACKUP_DIR || 'respaldos').then((f) => { console.log('Respaldo creado:', f); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
