'use strict';
/* FieldPoint · aplicación web. Solo presentación: la lógica de negocio y la seguridad están en la API. */
const $ = (s) => document.querySelector(s);
let TOKEN = sessionStorage.getItem('t'); let USER = JSON.parse(sessionStorage.getItem('u') || 'null');
let CUR = 'inicio'; let ROWS = []; let VTOK = 0;
const esc = (v) => (v == null ? '' : String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
const money = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const hoy = () => new Date().toISOString().slice(0, 10);
const V = (s) => { $('#view').innerHTML = s; };

/* Íconos de línea (trazo 2 px, extremos redondeados): el mismo estilo en menús, botones y mensajes. */
const P = {
  inicio: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', cobrar: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6', rapida: 'M13 2L4 14h7l-1 8 9-12h-7z',
  mesas: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z', comprobantes: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6',
  reportes: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2', productos: 'M20 12l-8 8-9-9V3h8z M7.5 7.5h.01', promociones: 'M19 5L5 19 M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  clientes: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8', reservas: 'M3 5h18v16H3z M16 3v4 M8 3v4 M3 10h18',
  canchas: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', proveedores: 'M1 3h15v13H1z M16 8h4l3 3v5h-7z M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  categorias: 'M12 2L2 7l10 5 10-5z M2 17l10 5 10-5 M2 12l10 5 10-5', usuarios: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M17 11l2 2 4-4',
  auditoria: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4', negocio: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  plus: 'M12 5v14 M5 12h14', trash: 'M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15 M10 11v6 M14 11v6', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  alert: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01', check: 'M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4L12 14l-3-3',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', history: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2', x: 'M18 6L6 18 M6 6l12 12', minus: 'M5 12h14',
};
const ic = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${P[n] || ''}"/></svg>`;
const ETI = { inicio: 'Inicio', cobrar: 'Cobrar', rapida: 'Reserva rápida', mesas: 'Mesas', comprobantes: 'Comprobantes', reportes: 'Reportes', productos: 'Productos', promociones: 'Promociones', clientes: 'Clientes', reservas: 'Reservas', canchas: 'Canchas', proveedores: 'Proveedores', categorias: 'Categorías', usuarios: 'Usuarios', auditoria: 'Auditoría', negocio: 'Negocio y licencia' };
const GRUPOS = [['Operación', ['inicio', 'cobrar', 'rapida', 'mesas', 'comprobantes', 'reportes']], ['Catálogo y clientes', ['productos', 'promociones', 'clientes', 'reservas', 'canchas', 'proveedores', 'categorias']], ['Administración', ['usuarios', 'auditoria', 'negocio']]];
const SOLO_ADMIN = ['usuarios', 'auditoria', 'negocio'];

const T = (l, n, t = 'text', x = {}) => ({ n, l, t, ...x });
const CFG = {
  productos: { pk: 'id_producto', f: [T('Nombre', 'nombre'), T('Categoría', 'id_categoria', 'ref', { r: 'categorias' }), T('Precio de venta', 'precio_venta', 'number'), T('Costo', 'costo', 'number'), T('Stock actual', 'stock_actual', 'number'), T('Stock mínimo', 'stock_minimo', 'number'), T('Activo', 'estado', 'checkbox')] },
  clientes: { pk: 'id_cliente', f: [T('Nombre', 'nombre'), T('Teléfono', 'telefono'), T('Correo', 'correo', 'email')] },
  reservas: { pk: 'id_reserva', f: [T('Cancha', 'id_cancha', 'ref', { r: 'canchas' }), T('Cliente', 'id_cliente', 'ref', { r: 'clientes' }), T('Fecha', 'fecha', 'date'), T('Hora inicio', 'hora_inicio', 'time'), T('Hora fin', 'hora_fin', 'time'), T('Estado', 'estado', 'sel', { o: ['Reservada', 'En uso', 'Cancelada'] }), T('Valor', 'valor', 'number')] },
  promociones: { pk: 'id_promocion', f: [T('Nombre', 'nombre'), T('Tipo', 'tipo', 'sel', { o: ['Porcentaje', 'Valor'] }), T('Valor', 'valor', 'number'), T('Desde', 'fecha_inicio', 'date'), T('Hasta', 'fecha_fin', 'date'), T('Activa', 'estado', 'checkbox')] },
  canchas: { pk: 'id_cancha', f: [T('Nombre', 'nombre'), T('Tarifa por hora', 'tarifa_hora', 'number'), T('Estado', 'estado')] },
  proveedores: { pk: 'id_proveedor', f: [T('Nombre', 'nombre'), T('Teléfono', 'telefono'), T('Correo', 'correo', 'email'), T('Dirección', 'direccion')] },
  categorias: { pk: 'id_categoria', f: [T('Nombre', 'nombre')] },
  usuarios: { pk: 'id_usuario', f: [T('Nombre', 'nombre'), T('Correo', 'correo', 'email'), T('Rol', 'id_rol', 'sel', { o: [[1, 'Administrador'], [2, 'Operador']] }), T('Contraseña', 'password', 'password', { nt: 1 }), T('Activo', 'estado', 'checkbox')] },
};

function toast(m, e) {
  const t = $('#toast'); t.className = e ? 'err' : 'ok'; t.innerHTML = ic(e ? 'alert' : 'check') + '<span></span>'; t.lastChild.textContent = m; t.hidden = false;
  clearTimeout(toast.i); toast.i = setTimeout(() => { t.hidden = true; }, 3200);
}
async function api(m, u, b) {
  const r = await fetch('/api/' + u, { method: m, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && TOKEN && u !== 'login') out();
  if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
  return j;
}
async function blob(path, name, open) {
  const r = await fetch('/api/' + path, { headers: { Authorization: 'Bearer ' + TOKEN } });
  if (!r.ok) { toast((await r.json()).error, 1); return; }
  const u = URL.createObjectURL(await r.blob());
  if (open) window.open(u, '_blank'); else { const a = document.createElement('a'); a.href = u; a.download = name; a.click(); }
}
function out() { sessionStorage.clear(); TOKEN = USER = null; $('#app').hidden = true; $('#login').hidden = false; }
function modal(html, wide) { const f = $('#mf'); f.className = 'card' + (wide ? ' wide' : ''); f.innerHTML = html; f.onclick = null; $('#mo').hidden = false; f.onsubmit = (e) => e.preventDefault(); f.querySelectorAll('#cancel,[data-close]').forEach((c) => { c.onclick = () => { $('#mo').hidden = true; }; }); }
const cargando = '<div class="cargando"><span class="spin"></span>Cargando…</div>';

function marcar(k) {
  document.querySelectorAll('.tab').forEach((b) => { const on = b.dataset.k === k; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#ttl').textContent = ETI[k] || '';
}
async function vista(k) {
  CUR = k; VTOK++; marcar(k); $('#view').onclick = null; $('#view').onkeydown = null; $('#barra').hidden = true; $('#alerta').innerHTML = ''; $('#crud').hidden = true; $('#view').hidden = false; V(cargando);
  try { await VF[k](); } catch (e) { toast(e.message, 1); }
}

/* ---- Vistas operativas ---- */
const VF={
async cobrar(){const _t=VTOK;const [pr,ca,ng,pm]=await Promise.all([api('GET','productos?limit=200'),api('GET','canchas'),api('GET','negocio'),api('GET','promociones?limit=100')]);if(_t!==VTOK)return;window.CB={pr:pr.data,ca:ca.data,ng,items:[],pm:pm.data.filter(p=>p.estado)};
if(_t!==VTOK)return;V(`<div class="card"><h2 style="margin:0 0 8px">Cobrar y generar comprobante</h2><label for="cn">Cliente (opcional)</label><input id="cn" data-testid="cliente" placeholder="Nombre del cliente"><div class="bar sec" style="margin-bottom:0"><select id="ct" data-testid="tipo-item"><option value="consumo">Consumo</option><option value="cancha">Cancha (horas)</option><option value="mesa">Mesa</option><option value="otro">Otro</option></select><select id="cp" data-testid="producto" style="flex:2"></select><input id="cd" data-testid="descripcion" placeholder="Descripción (ej. Mesa 3)" style="flex:2" hidden><input id="cq" type="number" min="1" value="1" style="max-width:90px" data-testid="cantidad"><input id="cv" type="number" min="0" placeholder="Valor" style="max-width:120px" data-testid="valor"><button class="btn sm" id="ca" data-testid="agregar">Agregar</button></div>
<div class="scroll sec"><table><thead><tr><th>Servicio</th><th>Cant.</th><th>Valor</th><th>Subtotal</th><th></th></tr></thead><tbody id="ci" data-testid="items"></tbody></table></div><div class="bar sec"><select id="cm" data-testid="metodo"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>QR</option></select><select id="cf"><option>Tirilla</option><option>Factura</option></select><b id="ctot" data-testid="total" style="font:700 22px Montserrat;color:var(--org);margin-left:auto">$ 0</b></div><div id="cqr"></div><div class="row"><button class="btn" id="cg" data-testid="generar">Generar comprobante</button></div><div id="cres" class="sec"></div></div>`);
const sel=()=>{const t=$('#ct').value;$('#cp').hidden=t==='mesa'||t==='otro';$('#cp').innerHTML=t==='consumo'?CB.pr.filter(p=>p.estado).map(p=>`<option value="${p.id_producto}">${esc(p.nombre)} · ${money(p.precio_venta)} (stock ${p.stock_actual})</option>`).join(''):t==='cancha'?CB.ca.map(c=>`<option value="${c.id_cancha}">${esc(c.nombre)} · ${money(c.tarifa_hora)}/h</option>`).join(''):'';$('#cv').hidden=t==='consumo'||t==='cancha';$('#cd').hidden=!(t==='mesa'||t==='otro');$('#cv').placeholder=t==='mesa'?'Valor de la mesa':'Valor'};sel();$('#ct').onchange=sel;
const pintar=async()=>{$('#ci').innerHTML=CB.items.map((i,n)=>`<tr><td>${esc(i.desc)}</td><td>${i.cantidad}</td><td>${money(i.precio)}</td><td>${money(i.precio*i.cantidad)}</td><td><button class="btn sm o" data-q="${n}">Quitar</button></td></tr>`).join('')||'<tr><td colspan="5">Sin servicios</td></tr>';$('#ctot').textContent=money(CB.items.reduce((s,i)=>s+i.precio*i.cantidad,0));const m=$('#cm').value;$('#cqr').innerHTML=(CB.items.length&&(m==='Transferencia'||m==='QR'))?`<p style="text-align:center;margin:8px 0">Escanee para pagar<img class="qr" id="qrimg" alt="Código QR de pago" data-testid="qr"></p>`:'';if(CB.items.length&&(m==='Transferencia'||m==='QR'))$('#qrimg').src=(await api('GET','qr')).dataUrl};
$('#ci').onclick=e=>{const b=e.target.closest('[data-q]');if(b){CB.items.splice(+b.dataset.q,1);pintar()}};$('#cm').onchange=pintar;
$('#ca').onclick=()=>{const t=$('#ct').value,q=parseInt($('#cq').value,10)||1;let it;if(t==='consumo'){const p=CB.pr.find(x=>x.id_producto==$('#cp').value);it={tipo:t,id_producto:p.id_producto,desc:p.nombre,precio:Number(p.precio_venta),cantidad:q}}else if(t==='cancha'){const c=CB.ca.find(x=>x.id_cancha==$('#cp').value);it={tipo:t,id_cancha:c.id_cancha,desc:`${c.nombre} (${q} h)`,precio:Number(c.tarifa_hora),cantidad:q}}else{const v=Number($('#cv').value);if(!(v>=0)||$('#cv').value==='')return toast('Escriba el valor',1);const d=$('#cd').value.trim()||(t==='mesa'?'Mesa':'Servicio');it={tipo:t,descripcion:d,desc:d,precio:v,cantidad:q};$('#cd').value=''}CB.items.push(it);pintar()};
$('#cg').onclick=async()=>{if(!CB.items.length)return toast('Agregue al menos un servicio',1);try{const c=await api('POST','comprobantes',{metodo:$('#cm').value,tipo:$('#cf').value,cliente_nombre:$('#cn').value.trim()||null,items:CB.items.map(i=>({tipo:i.tipo,id_producto:i.id_producto,id_cancha:i.id_cancha,descripcion:i.descripcion,precio_unitario:i.tipo==='consumo'||i.tipo==='cancha'?undefined:i.precio,cantidad:i.cantidad}))});CB.items=[];pintar();$('#cres').innerHTML=`<div class="alert" data-testid="resultado">Comprobante No. <b>${String(c.numero).padStart(6,'0')}</b> generado · Total ${money(c.total)} · ${esc(c.metodo)}</div><div class="bar"><button class="btn sm" data-p="${c.id_comprobante}" data-f="tirilla" data-testid="ver-tirilla">Ver tirilla (PDF)</button><button class="btn sm o" data-p="${c.id_comprobante}" data-f="factura" data-testid="ver-factura">Ver factura (PDF)</button></div>`}catch(e){toast(e.message,1)}};
$('#cres').onclick=e=>{const b=e.target.closest('[data-p]');if(b)blob(`comprobantes/${b.dataset.p}/pdf?formato=${b.dataset.f}`,'',true)};pintar()},
async rapida(){const _t=VTOK;const ca=(await api('GET','canchas')).data;if(_t!==VTOK)return;V(`<div class="card"><h2 style="margin:0">Reserva rápida con recordatorio por WhatsApp</h2><div class="r2"><div><label for="rn">Nombre del cliente</label><input id="rn" data-testid="r-nombre"><label for="rt">Celular</label><input id="rt" type="tel" data-testid="r-celular" placeholder="3001234567"></div><div><label for="rc">Cancha</label><select id="rc">${ca.map(c=>`<option value="${c.id_cancha}">${esc(c.nombre)}</option>`).join('')}</select><label for="rf">Fecha</label><input id="rf" type="date" value="${hoy()}"></div><div><label for="rh">Hora de inicio</label><input id="rh" type="time" value="18:00"><label for="rk">Hora final</label><input id="rk" type="time" value="19:00"></div></div><label for="rm">Método de pago</label><select id="rm"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>QR</option></select><div class="row"><button class="btn" id="rg" data-testid="r-generar">Reservar, generar tirilla y enviar WhatsApp</button></div><div id="rr" class="sec"></div></div>`);
$('#rg').onclick=async()=>{try{const r=await api('POST','reservas/rapida',{nombre:$('#rn').value,telefono:$('#rt').value,id_cancha:+$('#rc').value,fecha:$('#rf').value,hora_inicio:$('#rh').value,hora_fin:$('#rk').value,metodo:$('#rm').value});const n=r.notificacion;$('#rr').innerHTML=`<div class="alert" data-testid="r-resultado">Reserva confirmada · Comprobante No. <b>${String(r.comprobante.numero).padStart(6,'0')}</b> · ${money(r.comprobante.total)}${r.reserva_gratis?' · <b>Reserva gratis por fidelización</b>':''}</div><p><span class="chip ${n.estado==='enviado'?'':'r'}" data-testid="r-estado">WhatsApp: ${n.estado}</span> ${n.estado==='simulado'?'<small>(sin credenciales de WhatsApp Business o Twilio, el mensaje no se envía)</small>':''}</p><div class="wa" data-testid="r-mensaje">${esc(n.mensaje)}</div><div class="bar sec"><button class="btn sm" data-p="${r.comprobante.id_comprobante}" data-f="tirilla">Ver tirilla (PDF)</button></div>`;$('#rr').onclick=e=>{const b=e.target.closest('[data-p]');if(b)blob(`comprobantes/${b.dataset.p}/pdf?formato=${b.dataset.f}`,'',true)}}catch(e){toast(e.message,1)}}},
async comprobantes(){const _t=VTOK;const j=await api('GET','comprobantes?limit=100');if(_t!==VTOK)return;V(`<div class="card scroll"><h2 style="margin:0 0 8px">Comprobantes</h2><table><thead><tr><th>No.</th><th>Fecha</th><th>Cliente</th><th>Método</th><th>Total</th><th></th></tr></thead><tbody data-testid="lista-comprobantes">${j.data.map(c=>`<tr><td>${String(c.numero).padStart(6,'0')}</td><td>${String(c.fecha).slice(0,16).replace('T',' ')}</td><td>${esc(c.cliente_nombre||'Consumidor final')}</td><td>${esc(c.metodo)}</td><td>${money(c.total)}</td><td><button class="btn sm" data-p="${c.id_comprobante}" data-f="tirilla">Tirilla</button> <button class="btn sm o" data-p="${c.id_comprobante}" data-f="factura">Factura</button></td></tr>`).join('')||'<tr><td colspan="6">Sin comprobantes</td></tr>'}</tbody></table></div>`);$('#view').onclick=e=>{const b=e.target.closest('[data-p]');if(b)blob(`comprobantes/${b.dataset.p}/pdf?formato=${b.dataset.f}`,'',true)}},
async reportes(){const _t=VTOK;const adm=USER.rol==='Administrador';if(_t!==VTOK)return;V(`<div class="card"><h2 style="margin:0">Reportes de ventas</h2><div class="bar sec"><select id="pe" data-testid="periodo"><option value="diario">Diario (cierre del día)</option>${adm?'<option value="semanal">Semanal</option><option value="mensual">Mensual</option>':''}</select><input id="pf" type="date" value="${hoy()}" data-testid="fecha"><button class="btn" id="pg" data-testid="ver-reporte">Ver reporte</button><button class="btn o" id="pp" data-testid="reporte-pdf">PDF</button><button class="btn o" id="px" data-testid="reporte-excel">Excel</button></div><div id="rep"></div></div>`);
const q=()=>`reportes/${$('#pe').value}?fecha=${$('#pf').value}`;const lista=(t,f)=>`<div><h2>${t}</h2><table><tbody>${f.length?f.map(x=>`<tr><td>${esc(x[0])}</td><td style="text-align:right">${money(x[1])}</td></tr>`).join(''):'<tr><td>Sin movimientos</td></tr>'}</tbody></table></div>`;
const ver=async()=>{try{const r=await api('GET',q());const mx=Math.max(...r.porDia.map(d=>d.total),1);$('#rep').innerHTML=`<div class="grid sec" data-testid="kpis"><div class="kpi"><b>${money(r.total)}</b><span>Ventas</span></div><div class="kpi"><b>${r.comprobantes}</b><span>Comprobantes</span></div><div class="kpi"><b>${r.reservas.realizadas}</b><span>Reservas realizadas</span></div><div class="kpi"><b>${r.reservas.canceladas}</b><span>Reservas canceladas</span></div></div><div class="r2 sec">${lista('Por tipo',r.porTipo.map(x=>[x.tipo,x.total]))}${lista('Por cancha',r.porCancha.map(x=>[x.nombre,x.total]))}${lista('Por mesa',r.porMesa.map(x=>[x.nombre,x.total]))}${lista('Consumos',r.porProducto.map(x=>[`${x.nombre} (x${x.cantidad})`,x.total]))}${lista('Métodos de pago',r.porMetodo.map(x=>[x.metodo,x.total]))}</div>${r.porDia.length>1?`<div class="sec"><h2>Ventas por día</h2><div class="bars">${r.porDia.map((d,i)=>`<div class="${i===r.porDia.length-1?'h':''}"><i style="height:${Math.round(d.total/mx*120)}px"></i>${d.fecha.slice(8)}</div>`).join('')}</div></div>`:''}`}catch(e){toast(e.message,1)}};
$('#pg').onclick=ver;$('#pp').onclick=()=>blob(q()+'&formato=pdf','',true);$('#px').onclick=()=>blob(q()+'&formato=xlsx',`reporte_${$('#pe').value}_${$('#pf').value}.xlsx`);ver()},
async auditoria(){const _t=VTOK;const j=await api('GET','auditoria?limit=100');if(_t!==VTOK)return;V(`<div class="card scroll"><h2 style="margin:0 0 8px">Auditoría de operaciones</h2><table><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Tabla</th></tr></thead><tbody data-testid="lista-auditoria">${j.data.map(a=>`<tr><td>${String(a.fecha_hora).slice(0,19).replace('T',' ')}</td><td>${esc(a.usuario||'')}</td><td>${esc(a.accion)}</td><td>${esc(a.tabla_afectada)}</td></tr>`).join('')}</tbody></table></div>`)},
async negocio(){const _t=VTOK;const [n,l]=await Promise.all([api('GET','negocio'),api('GET','licencia')]);if(_t!==VTOK)return;V(`<div class="r2"><form class="card" id="nf"><h2 style="margin:0">Datos del negocio (tirillas y facturas)</h2><label for="nn">Nombre</label><input id="nn" value="${esc(n.nombre)}" data-testid="n-nombre"><label for="ni">NIT</label><input id="ni" value="${esc(n.nit)}" data-testid="n-nit"><label for="nd">Dirección</label><input id="nd" value="${esc(n.direccion)}"><label for="nt">Teléfono</label><input id="nt" value="${esc(n.telefono)}"><label for="nq">Texto del código QR de pago</label><input id="nq" value="${esc(n.qr_pago)}"><label for="nl">Logo (PNG o JPEG, máx. 300 KB)</label><input id="nl" type="file" accept="image/png,image/jpeg"><div class="row"><button class="btn" data-testid="n-guardar">Guardar</button></div></form>
<div class="card"><h2 style="margin:0">Licencia del producto</h2><p>Estado: <span class="chip ${l.activa?'':'e'}" data-testid="lic-estado">${l.activa?'Activa · '+esc(l.negocio):'Sin activar'}</span></p><p style="font-size:13px;color:var(--mut)">Identificador del equipo: <b>${esc(l.hardware_id)}</b></p><label for="lc">Clave de licencia</label><textarea id="lc" data-testid="lic-clave" placeholder="Pegue aquí la licencia recibida tras el pago"></textarea><div class="row"><button class="btn" id="la" data-testid="lic-activar">Activar licencia</button></div><h2 style="margin:20px 0 8px">Respaldo de datos</h2><p style="font-size:13px;color:var(--mut)">Descarga una copia completa de la base de datos (solo Administrador).</p><button class="btn o" id="rb" data-testid="respaldo">Descargar respaldo</button></div></div>`);
$('#nf').onsubmit=async e=>{e.preventDefault();const b={nombre:$('#nn').value,nit:$('#ni').value,direccion:$('#nd').value,telefono:$('#nt').value,qr_pago:$('#nq').value};const f=$('#nl').files[0];if(f){if(f.size>300000)return toast('El logo supera 300 KB',1);b.logo=await new Promise(r=>{const o=new FileReader();o.onload=()=>r(o.result);o.readAsDataURL(f)})}try{await api('PUT','negocio',b);toast('Datos del negocio guardados')}catch(er){toast(er.message,1)}};
$('#la').onclick=async()=>{try{const r=await api('POST','licencia/activar',{clave:$('#lc').value});toast('Licencia activada: '+r.negocio);VF.negocio()}catch(er){toast(er.message,1)}};$('#rb').onclick=()=>blob('respaldo',`fieldpoint_${hoy()}.json`)}};

async function revisarLicencia(){const l=await api('GET','licencia');if(!l.requerida||l.activa)return true;$('#tabs').innerHTML='';$('#barra').hidden=true;$('#crud').hidden=true;$('#view').hidden=false;
V(`<div class="card" style="max-width:560px;margin:20px auto"><h2 style="margin:0">Active su licencia de FieldPoint</h2><p>Este equipo necesita la licencia que recibió tras el pago único.</p><p style="font-size:13px;color:var(--mut)">Identificador de este equipo: <b>${esc(l.hardware_id)}</b></p><label for="lc">Clave de licencia</label><textarea id="lc" data-testid="lic-clave"></textarea><div class="row"><button class="btn" id="la" data-testid="lic-activar">Activar licencia</button></div></div>`);
$('#la').onclick=async()=>{try{await api('POST','licencia/activar',{clave:$('#lc').value});toast('Licencia activada');start()}catch(e){toast(e.message,1)}};return false}

/* ---- Inicio (dashboard) y Mesas ---- */
const fila = (a, b, c) => `<div class="fila"><span>${a}</span><span class="fr">${b || ''}</span>${c || ''}</div>`;
Object.assign(VF, {
  async inicio() {
    const _t = VTOK;
    const [rep, al, rs, cl, tb] = await Promise.all([api('GET', 'reportes/diario?fecha=' + hoy()), api('GET', 'inventario/alertas'), api('GET', 'reservas?limit=200'), api('GET', 'clientes?limit=200'), api('GET', 'mesas/tablero')]);
    if (_t !== VTOK) return;
    const nom = {}; cl.data.forEach((c) => { nom[c.id_cliente] = c.nombre; });
    const rh = rs.data.filter((r) => String(r.fecha).slice(0, 10) === hoy() && r.estado !== 'Cancelada').sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
    const oc = tb.data.filter((m) => m.estado === 'Ocupada');
    V(`<div class="grid" data-testid="inicio-kpis"><div class="kpi">${ic('cobrar')}<b>${money(rep.total)}</b><span>Ventas de hoy</span></div><div class="kpi">${ic('comprobantes')}<b>${rep.comprobantes}</b><span>Comprobantes</span></div><div class="kpi">${ic('reservas')}<b>${rh.length}</b><span>Reservas de hoy</span></div><div class="kpi">${ic('mesas')}<b>${oc.length}/${tb.data.length}</b><span>Mesas ocupadas</span></div></div>
<div class="r3 sec"><div class="card"><h2>${ic('reservas')} Reservas de hoy</h2>${rh.map((r) => fila(`<b>${String(r.hora_inicio).slice(0, 5)}</b> · ${esc(nom[r.id_cliente] || 'Cliente')}`, `<span class="chip ${r.estado === 'En uso' ? 'u' : 'r'}">${esc(r.estado)}</span>`)).join('') || '<p class="vacio">Sin reservas para hoy</p>'}<div class="row"><button class="btn sm o" data-go="reservas">Ver reservas</button></div></div>
<div class="card"><h2>${ic('mesas')} Mesas ocupadas</h2>${oc.map((m) => fila(`<b>Mesa ${m.numero}</b> · ${esc(m.cuenta.cliente || 'Sin cliente')}`, money(m.cuenta.total))).join('') || '<p class="vacio">Todas las mesas están libres</p>'}<div class="row"><button class="btn sm o" data-go="mesas">Ver mesas</button></div></div>
<div class="card"><h2>${ic('alert')} Alertas de inventario</h2>${al.data.map((p) => fila(esc(p.nombre), `<span class="chip e">Quedan ${p.stock_actual}</span>`)).join('') || '<p class="vacio">Inventario en orden</p>'}<div class="row"><button class="btn sm o" data-go="productos">Ir a productos</button></div></div></div>`);
    $('#view').querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
  },
  async mesas() {
    const _t = VTOK; const j = await api('GET', 'mesas/tablero'); if (_t !== VTOK) return;
    const adm = USER.rol === 'Administrador';
    V(`<div class="bar"><span class="leyenda"><i class="dot libre"></i>Libre <i class="dot ocupada"></i>Ocupada</span>${adm ? `<button class="btn" id="mn" data-testid="mesa-nueva">${ic('plus')} Nueva mesa</button>` : ''}</div>
<div class="mesas" data-testid="tablero">${j.data.map((m) => { const oc = m.estado === 'Ocupada'; return `<article class="mesa ${oc ? 'ocupada' : 'libre'}" data-id="${m.id_mesa}" data-n="${m.numero}" data-oc="${oc ? 1 : 0}" tabindex="0" data-testid="mesa-${m.numero}"><header><h3>Mesa ${m.numero}</h3><span class="chip ${oc ? 'r' : ''}" data-testid="mesa-estado-${m.numero}"><i class="dot ${oc ? 'ocupada' : 'libre'}"></i>${m.estado}</span></header>${m.cuenta ? `<p class="cl">${ic('clientes')} ${esc(m.cuenta.cliente || 'Sin cliente')}</p><p class="mt">${money(m.cuenta.total)}</p><small>${m.cuenta.items} consumo(s)</small>` : '<p class="cl">Disponible</p><p class="mt">&nbsp;</p><small>&nbsp;</small>'}<footer><button class="btn sm" data-a="abrir" data-testid="mesa-abrir-${m.numero}">${oc ? 'Ver consumos' : 'Marcar ocupada'}</button>${adm && !oc ? `<button class="btn sm d ic-only" data-a="del" aria-label="Eliminar mesa ${m.numero}" data-testid="mesa-eliminar-${m.numero}">${ic('trash')}</button>` : ''}</footer></article>`; }).join('') || '<p class="vacio">No hay mesas registradas</p>'}</div>`);
    const alt = (e) => { const a = e.target.closest('.mesa'); if (!a) return; const id = +a.dataset.id; const n = +a.dataset.n; const b = e.target.closest('[data-a]');
      if (b && b.dataset.a === 'del') { if (confirm(`¿Eliminar la mesa ${n}?`)) api('DELETE', 'mesas/' + id).then(() => { toast('Mesa eliminada'); vista('mesas'); }).catch((er) => toast(er.message, 1)); return; }
      if (a.dataset.oc === '1') mesaDetalle(id); else mesaOcupar(id, n); };
    $('#view').onclick = alt;
    $('#view').onkeydown = (e) => { if (e.key === 'Enter' && e.target.classList.contains('mesa')) alt(e); };
    const nb = $('#mn'); if (nb) nb.onclick = mesaNueva;
  },
});
const merr = (m) => { const b = $('#merr'); if (!b) return toast(m, 1); b.hidden = false; b.innerHTML = ic('alert') + '<span></span>'; b.lastChild.textContent = m; };

function mesaNueva() {
  modal(`<div class="mhead"><h2>Nueva mesa</h2><button type="button" class="btn sm o ic-only" id="cancel" aria-label="Cerrar">${ic('x')}</button></div><div class="fld"><label for="mn_n">Número de mesa</label><input id="mn_n" type="number" min="1" data-testid="mesa-numero"></div><div id="merr" class="msg err" hidden></div><div class="row"><button type="button" class="btn o" data-close>Cancelar</button><button class="btn" id="mn_ok" data-testid="mesa-guardar">Crear mesa</button></div>`);
  $('#mn_n').focus();
  $('#mn_ok').onclick = async () => { try { await api('POST', 'mesas', { numero: $('#mn_n').value }); $('#mo').hidden = true; toast('Mesa creada'); vista('mesas'); } catch (e) { $('#mn_n').classList.add('invalid'); merr(e.message); } };
}
async function mesaOcupar(id, num) {
  const cl = (await api('GET', 'clientes?limit=200')).data;
  modal(`<div class="mhead"><h2>Mesa ${num}: marcar como ocupada</h2><button type="button" class="btn sm o ic-only" id="cancel" aria-label="Cerrar">${ic('x')}</button></div><div class="fld"><label for="oc_c">Cliente asociado (opcional)</label><select id="oc_c" data-testid="ocupar-cliente"><option value="">Sin cliente asociado</option>${cl.map((c) => `<option value="${c.id_cliente}">${esc(c.nombre)}</option>`).join('')}</select></div><div id="merr" class="msg err" hidden></div><div class="row"><button type="button" class="btn o" data-close>Cancelar</button><button class="btn" id="oc_ok" data-testid="ocupar-confirmar">Marcar ocupada</button></div>`);
  $('#oc_ok').onclick = async () => { try { await api('POST', `mesas/${id}/ocupar`, { id_cliente: $('#oc_c').value || undefined }); toast(`Mesa ${num} ocupada`); vista('mesas'); mesaDetalle(id); } catch (e) { merr(e.message); } };
}
async function mesaDetalle(id) {
  const [d, pr, cl] = await Promise.all([api('GET', `mesas/${id}/consumos`), api('GET', 'productos?limit=200'), api('GET', 'clientes?limit=200')]);
  if (!d.cuenta) { $('#mo').hidden = true; vista('mesas'); return; }
  const prods = pr.data.filter((p) => p.estado);
  const lin = (c) => `<tr data-d="${c.id_detalle}" data-c="${c.cantidad}"><td>${esc(c.producto)}</td><td>${esc(c.cliente || '—')}</td><td class="cant"><button type="button" class="btn sm o ic-only" data-q="-1" aria-label="Quitar uno">${ic('minus')}</button><b>${c.cantidad}</b><button type="button" class="btn sm o ic-only" data-q="1" aria-label="Agregar uno">${ic('plus')}</button></td><td>${money(c.precio_unitario)}</td><td>${money(c.subtotal)}</td><td><button type="button" class="btn sm d ic-only" data-x="1" aria-label="Quitar consumo">${ic('trash')}</button></td></tr>`;
  modal(`<div class="mhead"><h2>Mesa ${d.mesa.numero} <span class="chip r"><i class="dot ocupada"></i>Ocupada</span></h2><button type="button" class="btn sm o ic-only" id="cancel" aria-label="Cerrar">${ic('x')}</button></div>
<p class="sub">${ic('clientes')} ${esc(d.cuenta.cliente || 'Sin cliente asociado')}</p>
<div class="scroll"><table><thead><tr><th>Producto</th><th>Cliente</th><th>Cant.</th><th>Valor</th><th>Subtotal</th><th></th></tr></thead><tbody data-testid="consumos-tabla">${d.consumos.map(lin).join('') || '<tr><td colspan="6" class="vacio">Aún no hay consumos</td></tr>'}</tbody></table></div>
<div class="addrow"><select id="cp_" data-testid="consumo-producto" aria-label="Producto">${prods.map((p) => `<option value="${p.id_producto}">${esc(p.nombre)} · ${money(p.precio_venta)} (stock ${p.stock_actual})</option>`).join('')}</select><input id="cq_" type="number" min="1" value="1" data-testid="consumo-cantidad" aria-label="Cantidad"><select id="cc_" data-testid="consumo-cliente" aria-label="Cliente del consumo"><option value="">Cliente de la mesa</option>${cl.data.map((c) => `<option value="${c.id_cliente}">${esc(c.nombre)}</option>`).join('')}</select><button type="button" class="btn" id="ca_" data-testid="consumo-agregar">${ic('plus')} Agregar</button></div>
<div class="total"><span>Total acumulado</span><b data-testid="consumos-total">${money(d.total)}</b></div>${d.porCliente.length > 1 ? `<div class="porcli">${d.porCliente.map((x) => `<span>${esc(x.cliente)}: <b>${money(x.total)}</b></span>`).join('')}</div>` : ''}
<div id="merr" class="msg err" hidden></div>
<div id="cierre" class="cierre" hidden><div class="fld"><label for="cm_">Método de pago</label><select id="cm_" data-testid="cerrar-metodo"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>QR</option></select></div><div class="fld"><label for="cf_">Comprobante</label><select id="cf_" data-testid="cerrar-tipo"><option>Tirilla</option><option>Factura</option></select></div><div id="cqr_"></div><button type="button" class="btn" id="cc2_" data-testid="cerrar-confirmar">${ic('check')} Confirmar cierre y generar comprobante</button></div>
<div class="row" id="acc_"><button type="button" class="btn o" id="ml_" data-testid="mesa-liberar" ${d.consumos.length ? 'disabled' : ''}>Marcar libre</button><button type="button" class="btn" id="mc_" data-testid="mesa-cerrar" ${d.consumos.length ? '' : 'disabled'}>Cerrar y cobrar</button></div>`, true);
  const rec = () => mesaDetalle(id).then(() => vista('mesas'));
  const run = async (fn) => { try { await fn(); await rec(); } catch (e) { merr(e.message); } };
  $('#ca_').onclick = () => run(() => api('POST', `mesas/${id}/consumos`, { id_producto: +$('#cp_').value, cantidad: +$('#cq_').value, id_cliente: $('#cc_').value || undefined }));
  $('.scroll tbody').onclick = (e) => { const tr = e.target.closest('tr[data-d]'); const b = e.target.closest('button'); if (!tr || !b) return; const idd = tr.dataset.d; const c = +tr.dataset.c;
    if (b.dataset.x || (b.dataset.q === '-1' && c <= 1)) run(() => api('DELETE', `mesas/${id}/consumos/${idd}`)); else run(() => api('PUT', `mesas/${id}/consumos/${idd}`, { cantidad: c + (+b.dataset.q) })); };
  $('#ml_').onclick = async () => { try { await api('POST', `mesas/${id}/liberar`); $('#mo').hidden = true; toast(`Mesa ${d.mesa.numero} libre`); vista('mesas'); } catch (e) { merr(e.message); } };
  $('#mc_').onclick = () => { $('#cierre').hidden = false; $('#acc_').hidden = true; };
  $('#cm_').onchange = async () => { const m = $('#cm_').value; $('#cqr_').innerHTML = (m === 'Transferencia' || m === 'QR') ? `<p class="qrt">Escanee para pagar<img class="qr" id="qri_" alt="Código QR de pago" data-testid="qr"></p>` : ''; if (m === 'Transferencia' || m === 'QR') $('#qri_').src = (await api('GET', 'qr')).dataUrl; };
  $('#cc2_').onclick = async () => { try { const c = await api('POST', `mesas/${id}/cerrar`, { metodo: $('#cm_').value, tipo: $('#cf_').value });
    modal(`<div class="mhead"><h2>Mesa ${d.mesa.numero} cerrada</h2><button type="button" class="btn sm o ic-only" id="cancel" aria-label="Cerrar">${ic('x')}</button></div><div class="msg ok" data-testid="cierre-resultado">${ic('check')}<span>Comprobante No. <b>${String(c.numero).padStart(6, '0')}</b> generado · Total ${money(c.total)} · ${esc(c.metodo)}. La mesa quedó libre.</span></div><div class="bar"><button class="btn sm" data-p="${c.id_comprobante}" data-f="tirilla" data-testid="ver-tirilla">Ver tirilla (PDF)</button><button class="btn sm o" data-p="${c.id_comprobante}" data-f="factura" data-testid="ver-factura">Ver factura (PDF)</button></div><div class="row"><button type="button" class="btn" data-close>Listo</button></div>`);
    $('#mf').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) blob(`comprobantes/${b.dataset.p}/pdf?formato=${b.dataset.f}`, '', true); };
    vista('mesas'); } catch (e) { merr(e.message); } };
}

/* ---- CRUD genérico ---- */
function celda(f, r) {
  const v = r[f.n];
  if (f.t === 'checkbox') return `<span class="chip ${v ? '' : 'e'}">${v ? 'Sí' : 'No'}</span>`;
  if (f.t === 'number') return esc(String(v ?? '').replace(/\.00$/, ''));
  if (f.t === 'date') return esc(String(v || '').slice(0, 10));
  if (f.t === 'sel' && Array.isArray(f.o[0])) return esc((f.o.find((o) => o[0] == v) || [])[1]);
  return esc(v);
}
async function load(k) {
  CUR = k; VTOK++; marcar(k); $('#view').hidden = true; $('#view').onclick = null; $('#crud').hidden = false; $('#barra').hidden = false; $('#q').value = ''; await list();
}
async function list() {
  const c = CFG[CUR];
  try {
    const j = await api('GET', CUR + '?limit=100&q=' + encodeURIComponent($('#q').value)); ROWS = j.data;
    $('#th').innerHTML = '<tr>' + ['#', ...c.f.filter((f) => !f.nt).map((f) => f.l), 'Acciones'].map((h) => `<th>${h}</th>`).join('') + '</tr>';
    $('#tb').innerHTML = ROWS.map((r) => `<tr data-id="${r[c.pk]}"><td>${r[c.pk]}</td>${c.f.filter((f) => !f.nt).map((f) => `<td>${celda(f, r)}</td>`).join('')}<td class="acc">${CUR === 'clientes' ? `<button class="btn sm" data-a="h" data-testid="historial">${ic('history')} Historial</button> ` : ''}<button class="btn sm o" data-a="e" data-testid="editar">${ic('edit')} Editar</button> <button class="btn sm d" data-a="x" data-testid="eliminar">${ic('trash')} Eliminar</button></td></tr>`).join('') || '<tr><td colspan="9" class="vacio">Sin registros</td></tr>';
    $('#cnt').textContent = j.total + ' registro(s)';
    if (CUR === 'productos') { const a = await api('GET', 'inventario/alertas'); $('#alerta').innerHTML = a.total ? `<div class="alert" data-testid="alerta-stock">${ic('alert')}<span>Stock bajo: ${a.data.map((p) => esc(p.nombre) + ' (' + p.stock_actual + ')').join(', ')}</span></div>` : ''; } else $('#alerta').innerHTML = '';
  } catch (e) { toast(e.message, 1); }
}
function errorCampo(msg) {
  const m = /(?:campo|en) ([a-z_]+)/i.exec(msg); const el = m && $('#f_' + m[1]);
  const def = m && CFG[CUR].f.find((f) => f.n === m[1]);
  const b = $('#ferr'); b.hidden = false; b.innerHTML = ic('alert') + '<span></span>'; b.lastChild.textContent = def ? `Revise el campo «${def.l}»: ${msg}` : msg;
  if (el) { el.classList.add('invalid'); el.setAttribute('aria-invalid', 'true'); el.focus(); el.addEventListener('input', () => { el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); }, { once: true }); }
}
async function form(row) {
  const c = CFG[CUR]; const refs = {};
  for (const f of c.f) if (f.r) refs[f.n] = (await api('GET', f.r + '?limit=200')).data;
  const campo = (f) => {
    const v = row ? row[f.n] : ''; const id = 'f_' + f.n; let i;
    if (f.t === 'ref') { const k = (o) => o[Object.keys(o)[0]]; i = `<select id="${id}" name="${f.n}"><option value="">—</option>${refs[f.n].map((o) => `<option value="${k(o)}" ${k(o) == v ? 'selected' : ''}>${esc(o.nombre || k(o))}</option>`).join('')}</select>`; }
    else if (f.t === 'sel') i = `<select id="${id}" name="${f.n}">${f.o.map((o) => { const [a, b] = Array.isArray(o) ? o : [o, o]; return `<option value="${a}" ${a == v ? 'selected' : ''}>${b}</option>`; }).join('')}</select>`;
    else if (f.t === 'checkbox') i = `<input id="${id}" name="${f.n}" type="checkbox" ${row ? (v ? 'checked' : '') : 'checked'}>`;
    else i = `<input id="${id}" name="${f.n}" type="${f.t}" ${f.t === 'number' ? 'step="any" min="0"' : ''} value="${f.t === 'date' && v ? String(v).slice(0, 10) : f.t === 'password' ? '' : esc(v)}" ${f.nt && row ? 'placeholder="Dejar vacío para no cambiar"' : ''}>`;
    return `<div class="fld ${f.t === 'checkbox' ? 'chk' : ''}"><label for="${id}">${f.l}</label>${i}</div>`;
  };
  modal(`<div class="mhead"><h2>${row ? 'Editar' : 'Nuevo'} · ${ETI[CUR]}</h2><button type="button" class="btn sm o ic-only" id="cancel" aria-label="Cerrar">${ic('x')}</button></div>${c.f.map(campo).join('')}<div class="msg err" id="ferr" data-testid="form-error" hidden></div><div class="row"><button type="button" class="btn o" data-close>Cancelar</button><button class="btn" data-testid="guardar">${ic('check')} Guardar</button></div>`);
  $('#mf').onsubmit = async (e) => {
    e.preventDefault(); const b = {};
    for (const f of c.f) { const el = $('#f_' + f.n); if (f.t === 'checkbox') b[f.n] = el.checked; else if (el.value !== '' || !row) b[f.n] = el.value; else if (f.t !== 'password') b[f.n] = null; if (f.t === 'password' && el.value === '') delete b[f.n]; }
    try { await api(row ? 'PUT' : 'POST', CUR + (row ? '/' + row[c.pk] : ''), b); $('#mo').hidden = true; toast(row ? 'Registro actualizado' : 'Registro creado'); list(); } catch (er) { errorCampo(er.message); }
  };
}
async function hist(id) {
  try {
    const h = await api('GET', 'clientes/' + id + '/historial'); const f = h.fidelizacion;
    modal(`<div class="mhead"><h2>${esc(h.cliente.nombre)} ${h.frecuente ? '<span class="chip">Cliente frecuente</span>' : ''}</h2><button type="button" class="btn sm o ic-only" id="cancel" aria-label="Cerrar">${ic('x')}</button></div><p>Visitas: <b>${h.visitas}</b> · Reservas pagadas: <b>${f.reservas}</b> · ${f.proxima_gratis ? '<b class="acento">La próxima reserva es gratis</b>' : 'Faltan <b>' + f.faltan + '</b> reservas para la reserva gratis'}</p><h3>Reservas</h3><table><tbody>${h.reservas.map((r) => `<tr><td>${String(r.fecha).slice(0, 10)}</td><td>${esc(r.cancha)}</td><td>${r.estado}</td><td class="der">${money(r.valor)}</td></tr>`).join('') || '<tr><td>Sin reservas</td></tr>'}</tbody></table><h3>Consumos y pagos</h3><table><tbody>${h.comprobantes.map((c) => `<tr><td>No. ${String(c.numero).padStart(6, '0')}</td><td>${esc(c.metodo)}</td><td class="der">${money(c.total)}</td></tr>`).join('') || '<tr><td>Sin comprobantes</td></tr>'}</tbody></table><div class="row"><button type="button" class="btn o" data-close>Cerrar</button></div>`);
  } catch (e) { toast(e.message, 1); }
}

/* ---- Arranque ---- */
function go(k) { return VF[k] ? vista(k) : load(k); }
async function start() {
  $('#login').hidden = true; $('#app').hidden = false; $('#who').textContent = USER.nombre + ' · ' + USER.rol; $('#tabs').innerHTML = '';
  if (!(await revisarLicencia())) return;
  const adm = USER.rol === 'Administrador';
  $('#tabs').innerHTML = GRUPOS.map(([g, ks]) => { const v = ks.filter((k) => adm || !SOLO_ADMIN.includes(k)); return v.length ? `<span class="nav-label">${g}</span>` + v.map((k) => `<button class="tab" data-k="${k}" data-testid="tab-${k}" title="${ETI[k]}">${ic(k)}<span>${ETI[k]}</span></button>`).join('') : ''; }).join('');
  vista('inicio');
}
$('#lf').onsubmit = async (e) => {
  e.preventDefault(); $('#lerr').textContent = ''; $('#lerr').classList.remove('on');
  try { const j = await api('POST', 'login', { correo: $('#correo').value, password: $('#pw').value }); TOKEN = j.token; USER = j.usuario; sessionStorage.setItem('t', TOKEN); sessionStorage.setItem('u', JSON.stringify(USER)); start(); }
  catch (er) { $('#lerr').textContent = er.message; $('#lerr').classList.add('on'); }
};
$('#tabs').onclick = (e) => { const b = e.target.closest('.tab'); if (b) go(b.dataset.k); };
$('#new').onclick = () => form(null);
$('#out').onclick = out;
$('#q').oninput = () => { clearTimeout($('#q').t); $('#q').t = setTimeout(list, 250); };
$('#mo').addEventListener('click', (e) => { if (e.target.id === 'mo') $('#mo').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#mo').hidden = true; });
$('#tb').onclick = async (e) => {
  const b = e.target.closest('button'); if (!b) return; const id = b.closest('tr').dataset.id; const row = ROWS.find((r) => r[CFG[CUR].pk] == id);
  if (b.dataset.a === 'h') return hist(id);
  if (b.dataset.a === 'e') form(row);
  else if (confirm('¿Eliminar este registro?')) { try { await api('DELETE', CUR + '/' + id); toast('Registro eliminado'); list(); } catch (er) { toast(er.message, 1); } }
};
if (TOKEN && USER) start();
