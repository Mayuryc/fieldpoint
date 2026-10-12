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
  const [tot, tipo, canchas, mesas, prod, met, dia, res, det] = await Promise.all([
    query(`SELECT COALESCE(SUM(c.total),0) AS total, COUNT(*) AS n FROM comprobantes c WHERE ${F}`, a),
    query(`SELECT i.tipo, SUM(i.subtotal) AS total FROM comprobante_items i JOIN comprobantes c ON c.id_comprobante=i.id_comprobante WHERE ${F} GROUP BY i.tipo ORDER BY total DESC`, a),
    query(`SELECT regexp_replace(i.descripcion, ' \\(\\d+ h\\)$', '') AS nombre, SUM(i.subtotal) AS total FROM comprobante_items i JOIN comprobantes c ON c.id_comprobante=i.id_comprobante WHERE ${F} AND i.tipo='cancha' GROUP BY 1 ORDER BY total DESC`, a),
    query(`SELECT nombre, SUM(total) AS total FROM (SELECT i.descripcion AS nombre, i.subtotal AS total FROM comprobante_items i JOIN comprobantes c ON c.id_comprobante=i.id_comprobante WHERE ${F} AND i.tipo='mesa' UNION ALL SELECT 'Mesa ' || m.numero AS nombre, c.total AS total FROM cuentas cu JOIN mesas m ON m.id_mesa=cu.id_mesa JOIN comprobantes c ON c.id_comprobante=cu.id_comprobante WHERE ${F}) x GROUP BY nombre ORDER BY total DESC`, a),
    query(`SELECT i.descripcion AS nombre, SUM(i.cantidad) AS cantidad, SUM(i.subtotal) AS total FROM comprobante_items i JOIN comprobantes c ON c.id_comprobante=i.id_comprobante WHERE ${F} AND i.tipo='consumo' GROUP BY i.descripcion ORDER BY total DESC`, a),
    query(`SELECT c.metodo, SUM(c.total) AS total FROM comprobantes c WHERE ${F} GROUP BY c.metodo ORDER BY total DESC`, a),
    query(`SELECT c.fecha::date AS fecha, SUM(c.total) AS total FROM comprobantes c WHERE ${F} GROUP BY c.fecha::date ORDER BY fecha`, a),
    query("SELECT COALESCE(SUM(CASE WHEN estado<>'Cancelada' THEN 1 ELSE 0 END),0) AS realizadas, COALESCE(SUM(CASE WHEN estado='Cancelada' THEN 1 ELSE 0 END),0) AS canceladas FROM reservas WHERE fecha BETWEEN $1::date AND $2::date", a),
    query(`SELECT c.numero, c.fecha, COALESCE(c.cliente_nombre, 'Consumidor final') AS cliente, c.metodo, c.tipo, c.subtotal, c.descuento, c.total FROM comprobantes c WHERE ${F} ORDER BY c.fecha, c.numero LIMIT 5000`, a),
  ]);
  return {
    periodo, desde, hasta, total: Number(tot.rows[0].total), comprobantes: Number(tot.rows[0].n),
    porTipo: sum(tipo.rows), porCancha: sum(canchas.rows), porMesa: sum(mesas.rows),
    porProducto: prod.rows.map((r) => ({ ...r, cantidad: Number(r.cantidad), total: Number(r.total) })),
    porMetodo: sum(met.rows), porDia: dia.rows.map((r) => ({ fecha: String(r.fecha).slice(0, 10), total: Number(r.total) })),
    reservas: { realizadas: Number(res.rows[0].realizadas), canceladas: Number(res.rows[0].canceladas) },
    detalle: det.rows.map((x) => ({ ...x, subtotal: Number(x.subtotal), descuento: Number(x.descuento), total: Number(x.total) })),
  };
}

const fs = require('fs');
const path = require('path');
const { fechaHora, paraExcel } = require('./hora');

const C = { navy: 'FF0A1F44', org: 'FFF15A24', gris: 'FFF4F6FA', linea: 'FFDDE2EA', txt: 'FF5A6478', blanco: 'FFFFFFFF', claro: 'FFD9D9D9' };
const MONEDA = '"$" #,##0';
const borde = { style: 'thin', color: { argb: C.linea } };
const BORDES = { top: borde, left: borde, bottom: borde, right: borde };
const lleno = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const dmy = (f) => String(f).slice(0, 10).split('-').reverse().join('/');
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Cabecera corporativa: banda azul con el nombre del reporte, el negocio y el periodo, y línea naranja. */
function banner(ws, neg, r, titulo, ncols) {
  const periodo = r.desde === r.hasta ? `Día ${dmy(r.desde)}` : `Del ${dmy(r.desde)} al ${dmy(r.hasta)}`;
  const filas = [[titulo, 16, true, C.blanco, 36], [`${neg.nombre}${neg.nit ? ' · NIT ' + neg.nit : ''}`, 10, false, C.claro, 20], [`${periodo} · Generado el ${fechaHora(new Date())}`, 10, false, C.claro, 20]];
  filas.forEach(([txt, size, bold, color, alto], i) => {
    const f = i + 1; ws.mergeCells(f, 1, f, ncols); ws.getRow(f).height = alto;
    for (let c = 1; c <= ncols; c++) ws.getCell(f, c).fill = lleno(C.navy);
    const cel = ws.getCell(f, 1); cel.value = txt; cel.font = { name: 'Calibri', size, bold, color: { argb: color } }; cel.alignment = { vertical: 'middle', indent: 1 };
  });
  ws.getRow(4).height = 5; for (let c = 1; c <= ncols; c++) ws.getCell(4, c).fill = lleno(C.org);
  ws.getRow(5).height = 10;
}
const nuevaHoja = (wb, nombre, color, neg) => {
  const ws = wb.addWorksheet(nombre, { properties: { tabColor: { argb: color } }, views: [{ showGridLines: false }], pageSetup: { paperSize: 1, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 } } });
  ws.headerFooter.oddFooter = `&L&8${String(neg.nombre).replace(/&/g, '&&')} · FieldPoint&C&8Página &P de &N&R&8&D`;
  return ws;
};
const encabezado = (ws, fila, titulos, alineaciones = []) => {
  ws.getRow(fila).height = 24;
  titulos.forEach((t, i) => { const c = ws.getCell(fila, i + 1); c.value = t; c.fill = lleno(C.navy); c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.blanco } }; c.alignment = { vertical: 'middle', horizontal: alineaciones[i] || 'left', indent: 1 }; c.border = BORDES; });
};
const celda = (ws, fila, col, valor, fmt, zebra, extra = {}) => {
  const c = ws.getCell(fila, col); c.value = valor; if (fmt) c.numFmt = fmt; if (zebra) c.fill = lleno(C.gris); c.border = BORDES;
  c.font = { name: 'Calibri', size: 10.5, ...extra.font }; c.alignment = { vertical: 'middle', indent: 1, ...extra.alignment }; return c;
};
const totales = (ws, fila, n, etiqueta, formulas) => {
  ws.getRow(fila).height = 24;
  for (let c = 1; c <= n; c++) { const x = ws.getCell(fila, c); x.fill = lleno(C.gris); x.border = { top: { style: 'medium', color: { argb: C.org } }, bottom: borde, left: borde, right: borde }; x.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.navy } }; x.alignment = { vertical: 'middle', indent: 1 }; }
  ws.getCell(fila, 1).value = etiqueta;
  Object.entries(formulas).forEach(([col, [formula, resultado, fmt]]) => { const x = ws.getCell(fila, +col); x.value = { formula, result: resultado }; x.numFmt = fmt; x.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 }; });
};

async function excel(neg, r) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'FieldPoint'; wb.created = new Date(); wb.title = `Reporte de ventas ${r.periodo}`; wb.company = neg.nombre;
  const titulo = `Reporte de ventas ${r.periodo}`;
  const mayor = (arr, k) => arr.reduce((m, x) => (m === null || x[k] > m[k] ? x : m), null);
  const ticket = r.comprobantes ? r.total / r.comprobantes : 0;
  const metodo = r.porMetodo[0]; const producto = mayor(r.porProducto, 'cantidad'); const dia = mayor(r.porDia, 'total');

  // ---- Resumen (tablero) ----
  const rs = nuevaHoja(wb, 'Resumen', C.org, neg);
  [24, 16, 24, 16, 24, 16, 24, 16].forEach((w, i) => { rs.getColumn(i + 1).width = w; });
  banner(rs, neg, r, titulo, 8);
  try {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'logo-h.png'));
    const id = wb.addImage({ buffer: buf, extension: 'png' }); const ratio = buf.readUInt32BE(20) / buf.readUInt32BE(16);
    rs.addImage(id, { tl: { col: 6.15, row: 0.12 }, ext: { width: 175, height: Math.round(175 * ratio) } });
  } catch { /* el reporte sale igual sin logo */ }
  const sec = (fila, txt) => { rs.mergeCells(fila, 1, fila, 8); const c = rs.getCell(fila, 1); c.value = txt; c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: C.navy } }; for (let k = 1; k <= 8; k++) rs.getCell(fila, k).border = { bottom: { style: 'medium', color: { argb: C.org } } }; rs.getRow(fila).height = 22; };
  sec(6, 'Indicadores clave');
  const tarjetas = [
    ['Ventas totales', r.total, MONEDA, 20], ['Comprobantes', r.comprobantes, '#,##0', 20], ['Ticket promedio', ticket, MONEDA, 20], ['Reservas realizadas', r.reservas.realizadas, '#,##0', 20],
    ['Reservas canceladas', r.reservas.canceladas, '#,##0', 20], ['Método de pago principal', metodo ? metodo.metodo : '—', null, 14], ['Producto más vendido', producto ? `${producto.nombre} (x${producto.cantidad})` : '—', null, 12], ['Día de mayor venta', dia ? `${dmy(dia.fecha)} · $ ${Math.round(dia.total).toLocaleString('es-CO')}` : '—', null, 12],
  ];
  tarjetas.forEach(([etq, val, fmt, size], i) => {
    const grupo = Math.floor(i / 4); const c1 = 1 + (i % 4) * 2; const fe = 7 + grupo * 3; const fv = fe + 1;
    rs.getRow(fe).height = 18; rs.getRow(fv).height = 34;
    rs.mergeCells(fe, c1, fe, c1 + 1); rs.mergeCells(fv, c1, fv, c1 + 1);
    const e = rs.getCell(fe, c1); e.value = etq; e.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.txt } }; e.alignment = { horizontal: 'center', vertical: 'middle' };
    const v = rs.getCell(fv, c1); v.value = val; if (fmt) v.numFmt = fmt; v.font = { name: 'Calibri', size, bold: true, color: { argb: C.org } }; v.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let k = c1; k <= c1 + 1; k++) { rs.getCell(fe, k).fill = lleno(C.gris); rs.getCell(fv, k).fill = lleno(C.gris); rs.getCell(fe, k).border = { top: borde, left: k === c1 ? borde : undefined, right: k === c1 + 1 ? borde : undefined }; rs.getCell(fv, k).border = { bottom: borde, left: k === c1 ? borde : undefined, right: k === c1 + 1 ? borde : undefined }; }
  });
  rs.getRow(10).height = 8; rs.getRow(13).height = 10;
  sec(14, 'Ventas por categoría');
  const bloques = [['Tipo de servicio', r.porTipo.map((x) => [x.tipo.charAt(0).toUpperCase() + x.tipo.slice(1), x.total])], ['Método de pago', r.porMetodo.map((x) => [x.metodo, x.total])], ['Cancha', r.porCancha.map((x) => [x.nombre, x.total])], ['Mesa', r.porMesa.map((x) => [x.nombre, x.total])]];
  const filas = Math.max(1, ...bloques.map((b) => b[1].length));
  bloques.forEach(([tit, datos], i) => {
    const c1 = 1 + i * 2; const f0 = 15;
    ['', ''].forEach((_, k) => { const c = rs.getCell(f0, c1 + k); c.value = k ? 'Total' : tit; c.fill = lleno(C.navy); c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.blanco } }; c.alignment = { vertical: 'middle', horizontal: k ? 'right' : 'left', indent: 1 }; c.border = BORDES; });
    for (let f = 0; f < filas; f++) { const d = datos[f]; const z = f % 2 === 1; celda(rs, f0 + 1 + f, c1, d ? d[0] : (f === 0 ? 'Sin movimientos' : ''), null, z, { font: d ? {} : { color: { argb: C.txt }, italic: true } }); celda(rs, f0 + 1 + f, c1 + 1, d ? d[1] : null, MONEDA, z, { alignment: { horizontal: 'right' } }); }
  });
  rs.getRow(f0Nota(filas)).height = 20; rs.mergeCells(f0Nota(filas), 1, f0Nota(filas), 8);
  const nota = rs.getCell(f0Nota(filas), 1); nota.value = 'Valores en pesos colombianos (COP). El reporte incluye solo comprobantes pagados; las reservas se cuentan por su fecha.'; nota.font = { name: 'Calibri', size: 9, italic: true, color: { argb: C.txt } };

  // ---- Comprobantes (detalle contable) ----
  const cp = nuevaHoja(wb, 'Comprobantes', C.navy, neg);
  [12, 20, 32, 16, 12, 16, 16, 16].forEach((w, i) => { cp.getColumn(i + 1).width = w; });
  banner(cp, neg, r, `${titulo} · Detalle de comprobantes`, 8);
  encabezado(cp, 6, ['No.', 'Fecha y hora', 'Cliente', 'Método de pago', 'Tipo', 'Subtotal', 'Descuento', 'Total'], ['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right']);
  r.detalle.forEach((d, i) => { const f = 7 + i; const z = i % 2 === 1;
    celda(cp, f, 1, String(d.numero).padStart(6, '0'), null, z); celda(cp, f, 2, paraExcel(d.fecha), 'dd/mm/yyyy hh:mm', z, { alignment: { horizontal: 'left' } }); celda(cp, f, 3, d.cliente, null, z); celda(cp, f, 4, d.metodo, null, z); celda(cp, f, 5, d.tipo, null, z);
    celda(cp, f, 6, d.subtotal, MONEDA, z, { alignment: { horizontal: 'right' } }); celda(cp, f, 7, d.descuento, MONEDA, z, { alignment: { horizontal: 'right' } }); celda(cp, f, 8, d.total, MONEDA, z, { alignment: { horizontal: 'right' } }); });
  const ult = 6 + Math.max(r.detalle.length, 1); const ft = ult + 1;
  if (!r.detalle.length) { cp.mergeCells(7, 1, 7, 8); celda(cp, 7, 1, 'No hay comprobantes en el periodo', null, false, { font: { italic: true, color: { argb: C.txt } } }); }
  const sd = r.detalle.reduce((s, x) => s + x.subtotal, 0); const dd = r.detalle.reduce((s, x) => s + x.descuento, 0);
  totales(cp, ft, 8, `Total (${r.detalle.length} comprobantes)`, { 6: [`SUM(F7:F${ult})`, sd, MONEDA], 7: [`SUM(G7:G${ult})`, dd, MONEDA], 8: [`SUM(H7:H${ult})`, r.detalle.reduce((s, x) => s + x.total, 0), MONEDA] });
  cp.views = [{ showGridLines: false, state: 'frozen', ySplit: 6 }]; cp.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(ult, 7), column: 8 } }; cp.pageSetup.printTitlesRow = '6:6';

  // ---- Consumos ----
  const co = nuevaHoja(wb, 'Consumos', C.org, neg);
  [38, 14, 18, 14].forEach((w, i) => { co.getColumn(i + 1).width = w; });
  banner(co, neg, r, `${titulo} · Consumos por producto`, 4);
  encabezado(co, 6, ['Producto', 'Cantidad', 'Total vendido', '% del total'], ['left', 'right', 'right', 'right']);
  const tc = r.porProducto.reduce((s, x) => s + x.total, 0); const uc = 6 + Math.max(r.porProducto.length, 1);
  r.porProducto.forEach((p, i) => { const f = 7 + i; const z = i % 2 === 1; celda(co, f, 1, p.nombre, null, z); celda(co, f, 2, p.cantidad, '#,##0', z, { alignment: { horizontal: 'right' } }); celda(co, f, 3, p.total, MONEDA, z, { alignment: { horizontal: 'right' } }); const x = celda(co, f, 4, { formula: `IF($C$${uc + 1}=0,0,C${f}/$C$${uc + 1})`, result: tc ? p.total / tc : 0 }, '0.0%', z, { alignment: { horizontal: 'right' } }); x.value = { formula: `IF($C$${uc + 1}=0,0,C${f}/$C$${uc + 1})`, result: tc ? p.total / tc : 0 }; });
  if (!r.porProducto.length) { co.mergeCells(7, 1, 7, 4); celda(co, 7, 1, 'No hay consumos en el periodo', null, false, { font: { italic: true, color: { argb: C.txt } } }); }
  totales(co, uc + 1, 4, 'Total', { 2: [`SUM(B7:B${uc})`, r.porProducto.reduce((s, x) => s + x.cantidad, 0), '#,##0'], 3: [`SUM(C7:C${uc})`, tc, MONEDA] });
  if (r.porProducto.length) co.addConditionalFormatting({ ref: `C7:C${uc}`, rules: [{ type: 'dataBar', priority: 1, gradient: false, showValue: true, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: 'FFF9B79C' } }] });
  co.views = [{ showGridLines: false, state: 'frozen', ySplit: 6 }]; co.pageSetup.printTitlesRow = '6:6';

  // ---- Por día ----
  const pd = nuevaHoja(wb, 'Por día', C.navy, neg);
  [16, 18, 20, 14].forEach((w, i) => { pd.getColumn(i + 1).width = w; });
  banner(pd, neg, r, `${titulo} · Ventas por día`, 4);
  encabezado(pd, 6, ['Fecha', 'Día', 'Ventas', '% del total'], ['left', 'left', 'right', 'right']);
  const up = 6 + Math.max(r.porDia.length, 1);
  r.porDia.forEach((d, i) => { const f = 7 + i; const z = i % 2 === 1; const fch = new Date(`${d.fecha}T00:00:00Z`);
    celda(pd, f, 1, fch, 'dd/mm/yyyy', z, { alignment: { horizontal: 'left' } }); celda(pd, f, 2, cap(DIAS[fch.getUTCDay()]), null, z); celda(pd, f, 3, d.total, MONEDA, z, { alignment: { horizontal: 'right' } });
    celda(pd, f, 4, { formula: `IF($C$${up + 1}=0,0,C${f}/$C$${up + 1})`, result: r.total ? d.total / r.total : 0 }, '0.0%', z, { alignment: { horizontal: 'right' } }); });
  if (!r.porDia.length) { pd.mergeCells(7, 1, 7, 4); celda(pd, 7, 1, 'No hay ventas en el periodo', null, false, { font: { italic: true, color: { argb: C.txt } } }); }
  totales(pd, up + 1, 4, 'Total', { 3: [`SUM(C7:C${up})`, r.porDia.reduce((s, x) => s + x.total, 0), MONEDA] });
  if (r.porDia.length > 1) pd.addConditionalFormatting({ ref: `C7:C${up}`, rules: [{ type: 'dataBar', priority: 1, gradient: false, showValue: true, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: 'FFF9B79C' } }] });
  pd.views = [{ showGridLines: false, state: 'frozen', ySplit: 6 }]; pd.pageSetup.printTitlesRow = '6:6';

  return Buffer.from(await wb.xlsx.writeBuffer());
}
const f0Nota = (filas) => 15 + filas + 2;

module.exports = { generar, excel, rango };
