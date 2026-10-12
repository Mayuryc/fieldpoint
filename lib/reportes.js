const ExcelJS = require('exceljs');
const { query } = require('./db');

const sum = (rows, k = 'total') => rows.map((r) => ({ ...r, [k]: Number(r[k]) }));
const addDays = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function rango(periodo, fecha) {
  if (periodo === 'diario') return [fecha, fecha];
  if (periodo === 'semanal') return [addDays(fecha, -6), fecha];
  const [y, m] = fecha.split('-').map(Number);
  return [`${y}-${String(m).padStart(2, '0')}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)];
}

async function generar(periodo, fecha) {
  const [desde, hasta] = rango(periodo, fecha);
  const a = [desde, hasta];
  const F = "c.estado='Pagado' AND c.fecha::date BETWEEN $1::date AND $2::date";
  const [tot, tipo, canchas, mesas, prod, met, dia, res] = await Promise.all([
    query(`SELECT COALESCE(SUM(c.total),0) AS total, COUNT(*) AS n FROM comprobantes c WHERE ${F}`, a),
    query(`SELECT i.tipo, SUM(i.subtotal) AS total FROM comprobante_items i JOIN comprobantes c ON c.id_comprobante=i.id_comprobante WHERE ${F} GROUP BY i.tipo ORDER BY total DESC`, a),
    query(`SELECT regexp_replace(i.descripcion, ' \\(\\d+ h\\)$', '') AS nombre, SUM(i.subtotal) AS total FROM comprobante_items i JOIN comprobantes c ON c.id_comprobante=i.id_comprobante WHERE ${F} AND i.tipo='cancha' GROUP BY 1 ORDER BY total DESC`, a),
    query(`SELECT nombre, SUM(total) AS total FROM (SELECT i.descripcion AS nombre, i.subtotal AS total FROM comprobante_items i JOIN comprobantes c ON c.id_comprobante=i.id_comprobante WHERE ${F} AND i.tipo='mesa' UNION ALL SELECT 'Mesa ' || m.numero AS nombre, c.total AS total FROM cuentas cu JOIN mesas m ON m.id_mesa=cu.id_mesa JOIN comprobantes c ON c.id_comprobante=cu.id_comprobante WHERE ${F}) x GROUP BY nombre ORDER BY total DESC`, a),
    query(`SELECT i.descripcion AS nombre, SUM(i.cantidad) AS cantidad, SUM(i.subtotal) AS total FROM comprobante_items i JOIN comprobantes c ON c.id_comprobante=i.id_comprobante WHERE ${F} AND i.tipo='consumo' GROUP BY i.descripcion ORDER BY total DESC`, a),
    query(`SELECT c.metodo, SUM(c.total) AS total FROM comprobantes c WHERE ${F} GROUP BY c.metodo ORDER BY total DESC`, a),
    query(`SELECT c.fecha::date AS fecha, SUM(c.total) AS total FROM comprobantes c WHERE ${F} GROUP BY c.fecha::date ORDER BY fecha`, a),
    query("SELECT COALESCE(SUM(CASE WHEN estado<>'Cancelada' THEN 1 ELSE 0 END),0) AS realizadas, COALESCE(SUM(CASE WHEN estado='Cancelada' THEN 1 ELSE 0 END),0) AS canceladas FROM reservas WHERE fecha BETWEEN $1::date AND $2::date", a),
  ]);
  return {
    periodo, desde, hasta, total: Number(tot.rows[0].total), comprobantes: Number(tot.rows[0].n),
    porTipo: sum(tipo.rows), porCancha: sum(canchas.rows), porMesa: sum(mesas.rows),
    porProducto: prod.rows.map((r) => ({ ...r, cantidad: Number(r.cantidad), total: Number(r.total) })),
    porMetodo: sum(met.rows), porDia: dia.rows.map((r) => ({ fecha: String(r.fecha).slice(0, 10), total: Number(r.total) })),
    reservas: { realizadas: Number(res.rows[0].realizadas), canceladas: Number(res.rows[0].canceladas) },
  };
}

async function excel(neg, r) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'FieldPoint';
  const estilo = (ws) => { ws.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1F44' } }; }); };
  const res = wb.addWorksheet('Resumen');
  res.columns = [{ header: 'Indicador', width: 32 }, { header: 'Valor', width: 24 }]; estilo(res);
  res.addRows([['Negocio', neg.nombre], ['Periodo', `${r.periodo} (${r.desde} a ${r.hasta})`], ['Ventas totales', r.total], ['Comprobantes', r.comprobantes], ['Reservas realizadas', r.reservas.realizadas], ['Reservas canceladas', r.reservas.canceladas]]);
  res.getCell('B4').numFmt = '"$" #,##0';
  const hoja = (nombre, cols, filas) => { const ws = wb.addWorksheet(nombre); ws.columns = cols.map((c) => ({ header: c, width: 30 })); estilo(ws); ws.addRows(filas); cols.forEach((c, i) => { if (c === 'Total') ws.getColumn(i + 1).numFmt = '"$" #,##0'; }); };
  hoja('Por tipo', ['Tipo', 'Total'], r.porTipo.map((x) => [x.tipo, x.total]));
  hoja('Por cancha', ['Cancha', 'Total'], r.porCancha.map((x) => [x.nombre, x.total]));
  hoja('Por mesa', ['Mesa', 'Total'], r.porMesa.map((x) => [x.nombre, x.total]));
  hoja('Consumos', ['Producto', 'Cantidad', 'Total'], r.porProducto.map((x) => [x.nombre, x.cantidad, x.total]));
  hoja('Métodos de pago', ['Método', 'Total'], r.porMetodo.map((x) => [x.metodo, x.total]));
  hoja('Por día', ['Fecha', 'Total'], r.porDia.map((x) => [x.fecha, x.total]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { generar, excel, rango };
