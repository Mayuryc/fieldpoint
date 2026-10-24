// Depuración según la política de retención. Por defecto SOLO SIMULA; use --aplicar para ejecutar.
//   node scripts/purgar.js            -> informa qué se depuraría
//   node scripts/purgar.js --aplicar  -> ejecuta
// Reglas: notificaciones > 6 meses; auditoría > 5 años; clientes sin reservas ni comprobantes en 2 años -> anonimizados.
const { query } = require('../lib/db');

const REGLAS = [
  ['notificaciones de más de 6 meses', "SELECT COUNT(*) AS n FROM notificaciones WHERE fecha < now() - interval '6 months'", "DELETE FROM notificaciones WHERE fecha < now() - interval '6 months'"],
  ['auditoría de más de 5 años', "SELECT COUNT(*) AS n FROM auditoria WHERE fecha_hora < now() - interval '5 years'", "DELETE FROM auditoria WHERE fecha_hora < now() - interval '5 years'"],
  ['clientes inactivos 2 años (anonimizar)',
    "SELECT COUNT(*) AS n FROM clientes c WHERE NOT c.anonimizado AND c.fecha_registro < now() - interval '2 years' AND NOT EXISTS (SELECT 1 FROM reservas r WHERE r.id_cliente=c.id_cliente AND r.fecha > now() - interval '2 years') AND NOT EXISTS (SELECT 1 FROM comprobantes p WHERE p.id_cliente=c.id_cliente AND p.fecha > now() - interval '2 years')",
    "UPDATE clientes c SET nombre='Cliente anonimizado #'||c.id_cliente, telefono=NULL, correo=NULL, autorizacion_datos=false, fecha_autorizacion=NULL, anonimizado=true WHERE NOT c.anonimizado AND c.fecha_registro < now() - interval '2 years' AND NOT EXISTS (SELECT 1 FROM reservas r WHERE r.id_cliente=c.id_cliente AND r.fecha > now() - interval '2 years') AND NOT EXISTS (SELECT 1 FROM comprobantes p WHERE p.id_cliente=c.id_cliente AND p.fecha > now() - interval '2 years')"],
];

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  for (const [nombre, contar, ejecutar] of REGLAS) {
    const n = Number((await query(contar)).rows[0].n);
    if (aplicar && n) await query(ejecutar);
    console.log(`${aplicar ? 'Depurado' : 'Se depuraría'}: ${n} ${nombre}`);
  }
  if (!aplicar) console.log('Simulación: no se modificó nada. Use --aplicar para ejecutar.');
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
