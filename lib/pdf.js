const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const NAVY = '#0A1F44';
const ORG = '#F15A24';
const GRIS = '#5A6478';
const FONT = (n) => path.join(__dirname, '..', 'public', 'fonts', n);
const LOGO = path.join(__dirname, '..', 'public', 'assets', 'logo-h.png');
const cop = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const { fechaHora: fecha } = require('./hora');
const numero = (n) => String(n).padStart(6, '0');

function nuevo(opts) {
  // Se usan solo las tipografías propias (public/fonts): así no se depende de las fuentes internas de pdfkit,
  // que no se empaquetan en Vercel. Si faltaran los archivos, se usan las estándar del PDF (solo en local).
  const existe = (n) => fs.existsSync(FONT(n));
  const titulo = existe('Montserrat-Bold.ttf') ? FONT('Montserrat-Bold.ttf') : 'Helvetica-Bold';
  const cuerpo = existe('OpenSans-Regular.ttf') ? FONT('OpenSans-Regular.ttf') : 'Helvetica';
  const doc = new PDFDocument({ ...opts, font: cuerpo, info: { Title: 'Tablero', Author: 'Tablero' } });
  doc.registerFont('B', titulo); doc.registerFont('S', titulo); doc.registerFont('R', cuerpo); doc.registerFont('RB', titulo);
  return doc;
}
const terminar = (doc) => new Promise((ok) => { const c = []; doc.on('data', (d) => c.push(d)); doc.on('end', () => ok(Buffer.concat(c))); doc.end(); });

/** El logo del negocio (data URL PNG/JPEG) o el de Tablero. */
function logo(neg) {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(neg.logo || '');
  return m ? Buffer.from(m[2], 'base64') : fs.readFileSync(LOGO);
}

/** Tirilla de 80 mm con la identidad de Tablero. */
async function tirilla(neg, c, items) {
  const W = 227; const h = 300 + items.length * 28;
  const doc = nuevo({ size: [W, h], margin: 12 });
  doc.rect(0, 0, W, 78).fill(NAVY);
  try { doc.image(logo(neg), 12, 10, { fit: [96, 38] }); } catch { /* logo inválido: se omite */ }
  doc.fillColor('#fff').font('B').fontSize(9).text(neg.nombre, 12, 52, { width: W - 24 });
  doc.rect(0, 78, W, 3).fill(ORG);
  doc.fillColor(NAVY).font('R').fontSize(7.5).text(`NIT: ${neg.nit || '-'}`, 12, 90).text(`Dirección: ${neg.direccion || '-'}`);
  doc.moveDown(0.4).font('S').fontSize(8).text(`Comprobante No: ${numero(c.numero)}`).font('R').text(`Fecha: ${fecha(c.fecha)}`).text(`Cliente: ${c.cliente_nombre || 'Consumidor final'}`);
  doc.moveDown(0.4).strokeColor(ORG).lineWidth(0.8).moveTo(12, doc.y).lineTo(W - 12, doc.y).stroke().moveDown(0.3);
  doc.font('S').fontSize(8).fillColor(NAVY).text('Servicios');
  for (const it of items) {
    const y = doc.y;
    doc.font('R').fontSize(7.5).fillColor('#000').text(`${it.descripcion}${it.cantidad > 1 ? ' x' + it.cantidad : ''}`, 12, y, { width: 135 });
    doc.font('RB').text(cop(it.subtotal), 140, y, { width: W - 152, align: 'right' });
    doc.moveDown(0.1);
  }
  doc.moveDown(0.3).strokeColor(ORG).moveTo(12, doc.y).lineTo(W - 12, doc.y).stroke().moveDown(0.3);
  if (Number(c.descuento) > 0) doc.font('R').fontSize(8).fillColor(GRIS).text(`Descuentos: -${cop(c.descuento)}`, { align: 'right' });
  doc.font('R').fontSize(8).fillColor(NAVY).text(`Método de pago: ${c.metodo}`, 12, doc.y, { width: W - 24 });
  doc.moveDown(0.2).font('B').fontSize(11).fillColor(ORG).text(`TOTAL: ${cop(c.total)}`, 12, doc.y, { width: W - 24, align: 'right' });
  doc.moveDown(0.8).font('S').fontSize(8).fillColor(NAVY).text('¡Gracias por su pago!', { align: 'center' }).font('R').fontSize(6.5).fillColor(GRIS).text('Tablero · Gestión deportiva', { align: 'center' });
  return terminar(doc);
}

/** Factura en tamaño carta. */
async function factura(neg, c, items) {
  const doc = nuevo({ size: 'LETTER', margin: 40 });
  doc.rect(0, 0, 612, 96).fill(NAVY); doc.rect(0, 96, 612, 4).fill(ORG);
  try { doc.image(logo(neg), 40, 22, { fit: [150, 56] }); } catch { /* logo inválido */ }
  doc.fillColor('#fff').font('B').fontSize(15).text(neg.nombre, 220, 26, { width: 350, align: 'right' }).font('R').fontSize(9).text(`NIT: ${neg.nit || '-'}  ·  ${neg.direccion || ''}  ·  Tel. ${neg.telefono || ''}`, 220, 50, { width: 350, align: 'right' });
  doc.fillColor(NAVY).font('B').fontSize(16).text(`FACTURA No. ${numero(c.numero)}`, 40, 120);
  doc.font('R').fontSize(10).fillColor(GRIS).text(`Fecha: ${fecha(c.fecha)}`, 40, 146).text(`Cliente: ${c.cliente_nombre || 'Consumidor final'}`).text(`Método de pago: ${c.metodo}`);
  let y = 200;
  doc.rect(40, y, 532, 22).fill(NAVY).fillColor('#fff').font('S').fontSize(9).text('Descripción', 48, y + 7).text('Cant.', 330, y + 7, { width: 40, align: 'right' }).text('Valor unitario', 380, y + 7, { width: 90, align: 'right' }).text('Subtotal', 480, y + 7, { width: 84, align: 'right' });
  y += 22;
  items.forEach((it, i) => {
    if (i % 2) doc.rect(40, y, 532, 22).fill('#F4F6FA');
    doc.fillColor('#000').font('R').fontSize(9.5).text(it.descripcion, 48, y + 6, { width: 270 }).text(String(it.cantidad), 330, y + 6, { width: 40, align: 'right' }).text(cop(it.precio_unitario), 380, y + 6, { width: 90, align: 'right' }).text(cop(it.subtotal), 480, y + 6, { width: 84, align: 'right' });
    y += 22;
  });
  y += 12;
  doc.font('R').fontSize(10).fillColor(GRIS).text(`Subtotal: ${cop(c.subtotal)}`, 380, y, { width: 184, align: 'right' });
  if (Number(c.descuento) > 0) { y += 16; doc.text(`Descuentos: -${cop(c.descuento)}`, 380, y, { width: 184, align: 'right' }); }
  y += 20; doc.font('B').fontSize(14).fillColor(ORG).text(`TOTAL: ${cop(c.total)}`, 340, y, { width: 224, align: 'right' });
  doc.font('R').fontSize(9).fillColor(GRIS).text('Gracias por su compra. Documento generado por Tablero.', 40, 730, { width: 532, align: 'center' });
  return terminar(doc);
}

/** Reporte de ventas (diario, semanal o mensual) con gráfica de barras. */
async function reporte(neg, r) {
  const doc = nuevo({ size: 'LETTER', margin: 40 });
  doc.rect(0, 0, 612, 80).fill(NAVY); doc.rect(0, 80, 612, 4).fill(ORG);
  try { doc.image(logo(neg), 40, 18, { fit: [130, 46] }); } catch { /* logo inválido */ }
  doc.fillColor('#fff').font('B').fontSize(14).text(`Reporte ${r.periodo}`, 200, 24, { width: 372, align: 'right' }).font('R').fontSize(9).text(`${neg.nombre} · ${r.desde === r.hasta ? r.desde : r.desde + ' a ' + r.hasta}`, 200, 46, { width: 372, align: 'right' });
  const k = [['Ventas', cop(r.total)], ['Comprobantes', r.comprobantes], ['Reservas realizadas', r.reservas.realizadas], ['Reservas canceladas', r.reservas.canceladas]];
  k.forEach(([t, v], i) => { const x = 40 + i * 136; doc.roundedRect(x, 104, 126, 52, 8).fill('#F4F6FA'); doc.fillColor(ORG).font('B').fontSize(13).text(String(v), x + 8, 114, { width: 110 }); doc.fillColor(GRIS).font('R').fontSize(8).text(t, x + 8, 136, { width: 110 }); });
  let y = 176;
  const tabla = (titulo, filas, cols) => {
    doc.fillColor(NAVY).font('B').fontSize(10.5).text(titulo, 40, y); y += 18;
    doc.rect(40, y, 532, 18).fill(NAVY).fillColor('#fff').font('S').fontSize(8.5).text(cols[0], 48, y + 5).text(cols[1], 440, y + 5, { width: 124, align: 'right' }); y += 18;
    if (!filas.length) { doc.fillColor(GRIS).font('R').fontSize(8.5).text('Sin movimientos', 48, y + 4); y += 18; }
    filas.forEach((f, i) => { if (i % 2) doc.rect(40, y, 532, 17).fill('#F4F6FA'); doc.fillColor('#000').font('R').fontSize(8.5).text(f[0], 48, y + 4, { width: 380 }).text(f[1], 440, y + 4, { width: 124, align: 'right' }); y += 17; });
    y += 12;
  };
  tabla('Ventas por tipo de servicio', r.porTipo.map((x) => [x.tipo, cop(x.total)]), ['Tipo', 'Total']);
  tabla('Ventas por cancha', r.porCancha.map((x) => [x.nombre, cop(x.total)]), ['Cancha', 'Total']);
  tabla('Ventas por mesa', r.porMesa.map((x) => [x.nombre, cop(x.total)]), ['Mesa', 'Total']);
  tabla('Consumos por producto', r.porProducto.map((x) => [`${x.nombre} (x${x.cantidad})`, cop(x.total)]), ['Producto', 'Total']);
  tabla('Métodos de pago', r.porMetodo.map((x) => [x.metodo, cop(x.total)]), ['Método', 'Total']);
  if (r.porDia.length > 1) {
    if (y > 560) { doc.addPage(); y = 40; }
    doc.fillColor(NAVY).font('B').fontSize(10.5).text('Ventas por día', 40, y); y += 22;
    const max = Math.max(...r.porDia.map((d) => d.total), 1); const bw = Math.min(30, 500 / r.porDia.length - 4);
    r.porDia.forEach((d, i) => { const hh = (d.total / max) * 110; const x = 48 + i * (bw + 4); doc.rect(x, y + 110 - hh, bw, hh).fill(i === r.porDia.length - 1 ? ORG : NAVY); doc.fillColor(GRIS).font('R').fontSize(6).text(d.fecha.slice(8), x, y + 114, { width: bw, align: 'center' }); });
  }
  return terminar(doc);
}

module.exports = { tirilla, factura, reporte, cop, numero };
