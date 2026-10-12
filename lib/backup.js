const fs = require('fs');
const path = require('path');
const { query, tx } = require('./db');

// Orden respetando las llaves foráneas (padres antes que hijos).
const TABLAS = ['roles', 'usuarios', 'clientes', 'canchas', 'reservas', 'mesas', 'categorias', 'productos', 'promociones', 'negocio', 'comprobantes', 'comprobante_items', 'cuentas', 'detalle_cuenta', 'proveedores', 'compras', 'detalle_compra', 'movimientos_inventario', 'pagos', 'egresos', 'auditoria', 'notificaciones'];

async function exportar() {
  const tablas = {};
  for (const t of TABLAS) tablas[t] = (await query(`SELECT * FROM ${t}`)).rows;
  return { app: 'FieldPoint', version: 1, creado: new Date().toISOString(), tablas };
}

async function restaurar(dump) {
  if (!dump || dump.app !== 'FieldPoint' || !dump.tablas) throw new Error('Archivo de respaldo no válido');
  await tx(async (t) => {
    for (const n of [...TABLAS].reverse()) await t.query(`DELETE FROM ${n}`);
    for (const n of TABLAS) {
      for (const row of dump.tablas[n] || []) {
        const k = Object.keys(row);
        await t.query(`INSERT INTO ${n} (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')})`, k.map((c) => row[c]));
      }
      const pk = (await t.query("SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=$1::regclass AND i.indisprimary", [n])).rows[0];
      const seq = pk && (await t.query('SELECT pg_get_serial_sequence($1,$2) AS s', [n, pk.attname])).rows[0].s;
      if (seq) await t.query(`SELECT setval('${seq}', COALESCE((SELECT MAX(${pk.attname}) FROM ${n}),0)+1, false)`);
    }
  });
}

/** Copia diaria en una carpeta, conservando los últimos 30 archivos. */
async function respaldarEnCarpeta(dir, conservar = 30) {
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `fieldpoint_${new Date().toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(archivo)) fs.writeFileSync(archivo, JSON.stringify(await exportar()));
  const todos = fs.readdirSync(dir).filter((f) => /^fieldpoint_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  todos.slice(0, Math.max(0, todos.length - conservar)).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  return archivo;
}

module.exports = { exportar, restaurar, respaldarEnCarpeta, TABLAS };
