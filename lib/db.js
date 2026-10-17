const fs = require('fs');
const path = require('path');
const auth = require('./auth');

let pool = null;

/** Dirección de la base de datos. Acepta DATABASE_URL o las variables que crea la integración de Neon,
 *  con o sin prefijo (por ejemplo BASEDATA_DATABASE_URL cuando se eligió un prefijo al conectarla). */
function urlBase() {
  const e = process.env;
  if (e.DATABASE_URL || e.POSTGRES_URL) return e.DATABASE_URL || e.POSTGRES_URL;
  for (const re of [/_DATABASE_URL$/, /_POSTGRES_URL$/, /^DATABASE_URL_UNPOOLED$|_DATABASE_URL_UNPOOLED$/, /^POSTGRES_URL_NON_POOLING$|_POSTGRES_URL_NON_POOLING$/]) {
    const k = Object.keys(e).sort().find((n) => re.test(n) && e[n]);
    if (k) return e[k];
  }
  return '';
}

async function create() {
  const url = urlBase();
  if (!url && process.env.VERCEL) throw new Error('Falta DATABASE_URL: conecte la base de datos (Storage > Neon) y vuelva a desplegar');
  if (url) {
    const { Pool, types } = require('pg');
    types.setTypeParser(1082, (v) => v); // DATE como texto AAAA-MM-DD, sin desfase de zona horaria
    // El SSL se define abajo; se quitan de la dirección los parámetros que podrían contradecirlo.
    const u = new URL(url); ['sslmode', 'channel_binding', 'uselibpqcompat'].forEach((k) => u.searchParams.delete(k));
    const p = new Pool({ connectionString: u.toString(), ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false }, max: Number(process.env.PG_POOL_MAX) || 5, connectionTimeoutMillis: 10000 });
    return { p, mode: 'postgres', tx: async (fn) => { const c = await p.connect(); try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK').catch(() => null); throw e; } finally { c.release(); } } };
  }
  // Modo local/demo: PostgreSQL embebido (PGlite). Con FP_DATA_DIR guarda los datos en disco.
  const { PGlite } = require('@electric-sql/pglite');
  const dir = process.env.FP_DATA_DIR;
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const p = new PGlite({ dataDir: dir || undefined, parsers: { 1082: (v) => v } });
  await p.waitReady;
  return { p, mode: dir ? 'local (archivo)' : 'memoria (demo)', tx: (fn) => p.transaction((t) => fn(t)) };
}

async function seed(p) {
  const has = await p.query('SELECT id_rol FROM roles LIMIT 1');
  if (has.rows.length) return;
  await p.query("INSERT INTO roles (nombre, descripcion) VALUES ('Administrador','Acceso total'),('Operador','Reservas, cuentas, inventario y caja')");
  const pw = process.env.SEED_PASSWORD || 'FieldPoint2026*';
  await p.query("INSERT INTO usuarios (id_rol, nombre, usuario, correo, contrasena_cifrada) VALUES (1,$1,'admin',$2,$3),(2,$4,'operador',$5,$3)",
    ['Administrador general', 'admin@fieldpoint.co', auth.hash(pw), 'Operador turno tarde', 'operador@fieldpoint.co']);
  await p.query("INSERT INTO categorias (nombre) VALUES ('Bebidas'),('Comidas')");
  await p.query("INSERT INTO canchas (nombre, tarifa_hora) VALUES ('Cancha sintética Fútbol 10', 50000)");
  await p.query('INSERT INTO mesas (numero) VALUES (1),(2),(3),(4),(5)');
  await p.query("INSERT INTO productos (id_categoria, nombre, precio_venta, costo, stock_actual, stock_minimo) VALUES (1,'Gaseosa',4000,2500,24,10),(1,'Agua',2500,1200,6,10),(1,'Cerveza',5000,3200,30,12),(2,'Empanada',3500,2000,15,8),(2,'Papas',3000,1500,4,6),(1,'Jugo',4500,2600,12,6),(2,'Pizza',20000,11000,10,3)");
  await p.query("INSERT INTO clientes (nombre, telefono) VALUES ('Los Halcones','3105550101'),('Amigos del barrio','3115550202')");
  await p.query("INSERT INTO proveedores (nombre, telefono) VALUES ('Distribuidora Huila','3105550101'),('Bebidas del Sur','3115550202')");
  await p.query("INSERT INTO negocio (id_negocio, nombre, nit, direccion, telefono, qr_pago) VALUES (1,'Cancha Sintética Fútbol 10','123456789-0','Calle 10 #5-20','3105550101','https://pagos.fieldpoint.co/demo')");
}

async function db() {
  if (pool) return pool;
  const c = await create();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) await c.p.query(stmt);
  await seed(c.p);
  pool = c;
  return pool;
}

const query = async (text, args = []) => (await db()).p.query(text, args);
const tx = async (fn) => (await db()).tx(fn);
const mode = async () => (await db()).mode;
const reset = () => { pool = null; };

module.exports = { query, tx, mode, reset };
