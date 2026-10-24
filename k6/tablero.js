// Plan de carga y estrés de Tablero con k6 (equivalente al plan de JMeter jmeter/tablero.jmx).
// Uso:  k6 run -e BASE_URL=https://<proyecto>.vercel.app -e PERFIL=carga k6/tablero.js
//       PERFIL = humo | carga (50 usuarios) | carga250 (250 usuarios) | estres (hasta 300 usuarios)
import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const USUARIO = __ENV.USUARIO || 'admin';
const CLAVE = __ENV.CLAVE || 'Tablero2026*';
const PERFIL = __ENV.PERFIL || 'humo';

const PERFILES = {
  humo: { stages: [{ duration: '10s', target: 5 }, { duration: '10s', target: 5 }, { duration: '5s', target: 0 }] },
  carga: { stages: [{ duration: '30s', target: 50 }, { duration: '120s', target: 50 }, { duration: '15s', target: 0 }] },
  carga250: { stages: [{ duration: '40s', target: 250 }, { duration: '120s', target: 250 }, { duration: '20s', target: 0 }] },
  estres: { stages: [{ duration: '40s', target: 100 }, { duration: '40s', target: 200 }, { duration: '40s', target: 300 }, { duration: '60s', target: 300 }, { duration: '20s', target: 0 }] },
};
export const options = {
  scenarios: { tablero: { executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '10s', ...PERFILES[PERFIL] } },
  thresholds: PERFIL === 'carga' ? { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<2000'] } : {},
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export function setup() {
  const r = http.post(`${BASE}/api/login`, JSON.stringify({ usuario: USUARIO, password: CLAVE }), { headers: { 'Content-Type': 'application/json' } });
  if (r.status !== 200) throw new Error(`No se pudo iniciar sesión (${r.status}): ${r.body}`);
  return { token: r.json('token') };
}

export default function (d) {
  const h = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${d.token}` } };
  group('Productos (CRUD)', () => {
    check(http.get(`${BASE}/api/productos?limit=20`, h), { 'GET productos 200': (r) => r.status === 200 });
    const c = http.post(`${BASE}/api/productos`, JSON.stringify({ nombre: `Prueba ${__VU}-${__ITER}`, precio_venta: 1000, costo: 500, stock_actual: 10, stock_minimo: 1 }), h);
    check(c, { 'POST productos 201': (r) => r.status === 201 });
    const id = c.status === 201 ? c.json('id_producto') : null;
    if (id) {
      check(http.get(`${BASE}/api/productos/${id}`, h), { 'GET productos/id 200': (r) => r.status === 200 });
      check(http.put(`${BASE}/api/productos/${id}`, JSON.stringify({ precio_venta: 1500 }), h), { 'PUT productos 200': (r) => r.status === 200 });
      check(http.del(`${BASE}/api/productos/${id}`, null, h), { 'DELETE productos 200': (r) => r.status === 200 });
    }
  });
  group('Reservas, comprobantes y reportes', () => {
    check(http.get(`${BASE}/api/reservas?limit=20`, h), { 'GET reservas 200': (r) => r.status === 200 });
    check(http.post(`${BASE}/api/comprobantes`, JSON.stringify({ metodo: 'Efectivo', items: [{ tipo: 'otro', descripcion: 'Prueba de carga', precio_unitario: 1000, cantidad: 1 }] }), h), { 'POST comprobantes 201': (r) => r.status === 201 });
    check(http.get(`${BASE}/api/reportes/diario`, h), { 'GET reportes/diario 200': (r) => r.status === 200 });
    check(http.get(`${BASE}/api/mesas/tablero`, h), { 'GET mesas/tablero 200': (r) => r.status === 200 });
  });
  sleep(1);
}
