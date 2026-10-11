const pad = (n) => String(n).padStart(2, '0');

function hora12(h) {
  const [hh, mm] = String(h).split(':').map(Number);
  return `${hh % 12 || 12}:${pad(mm)} ${hh >= 12 ? 'PM' : 'AM'}`;
}

/** Mensaje de confirmación de la reserva (plantilla del negocio). */
function mensaje({ negocio, cliente, cancha, fecha, hora, metodo }) {
  const [y, m, d] = String(fecha).slice(0, 10).split('-');
  return `⚽ ${negocio}\nHola ${cliente}, tu reserva está confirmada:\n\n📍 ${cancha}\n🕒 Fecha: ${d}/${m}/${y} - ${hora12(hora)}\n💳 Pago: ${metodo}\n\n¡Gracias por elegirnos! Te esperamos.`;
}

/** Normaliza números colombianos de 10 dígitos al formato internacional. */
function telefono(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return '57' + d;
  return d.length >= 11 ? d : null;
}

/** Envía por Twilio o por la API de WhatsApp Business; sin credenciales queda en modo simulado. */
async function enviar(to, texto) {
  const num = telefono(to);
  if (!num) return { estado: 'error', canal: 'ninguno', detalle: 'Teléfono no válido' };
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: tok, TWILIO_WHATSAPP_FROM: from, WHATSAPP_TOKEN: wt, WHATSAPP_PHONE_ID: wid } = process.env;
  try {
    if (sid && tok && from) {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: `whatsapp:${from}`, To: `whatsapp:+${num}`, Body: texto }),
      });
      return { estado: r.ok ? 'enviado' : 'error', canal: 'twilio' };
    }
    if (wt && wid) {
      const r = await fetch(`https://graph.facebook.com/v19.0/${wid}/messages`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + wt, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: num, type: 'text', text: { body: texto } }),
      });
      return { estado: r.ok ? 'enviado' : 'error', canal: 'whatsapp-business' };
    }
  } catch { return { estado: 'error', canal: 'red' }; }
  return { estado: 'simulado', canal: 'simulado' };
}

module.exports = { mensaje, enviar, telefono, hora12 };
