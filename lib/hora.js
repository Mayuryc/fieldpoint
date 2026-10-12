// Fecha y hora en la zona horaria de Colombia (los servidores en la nube trabajan en UTC).
const TZ = 'America/Bogota';
const partes = (d) => {
  const o = {};
  new Intl.DateTimeFormat('es-CO', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(d)).forEach((p) => { o[p.type] = p.value; });
  return { ...o, hour: String(Number(o.hour) % 24).padStart(2, '0') };
};
/** dd/mm/aaaa hh:mm */
const fechaHora = (d) => { const p = partes(d); return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`; };
/** Fecha cuyo valor UTC coincide con la hora de pared de Colombia: Excel la muestra sin desfase. */
const paraExcel = (d) => { const p = partes(d); return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)); };
module.exports = { fechaHora, paraExcel, TZ };
