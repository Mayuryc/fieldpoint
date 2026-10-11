const { query } = require('./db');

/** Registra quién hizo qué y cuándo (la fecha y hora las pone la base de datos). */
const audit = (u, accion, tabla) => query('INSERT INTO auditoria (id_usuario, accion, tabla_afectada) VALUES ($1,$2,$3)', [u.sub, accion, tabla]).catch(() => null);

module.exports = { audit };
