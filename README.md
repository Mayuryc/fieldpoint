# FieldPoint · Fase 3: producto instalable y salida al mercado

Sistema de gestión para canchas sintéticas, mesas y consumos. Funciona en **la nube (Vercel + PostgreSQL)** y como **aplicación de escritorio (Electron + PostgreSQL embebido)**, con la identidad visual del manual de FieldPoint.

## Funciones
| Módulo | Qué hace |
|---|---|
| CRUD de 8 módulos | Productos, clientes, reservas, promociones, canchas, proveedores, categorías y usuarios |
| Mesas con estado | Tablero con estado (Libre / Ocupada), consumos por producto y cliente acumulados en la cuenta de la mesa hasta el cierre, y cierre con comprobante. El administrador crea y elimina mesas; el operador marca ocupada/libre y registra consumos |
| Cobrar | Comprobante con cancha, mesa y consumos; método de pago (efectivo, transferencia, tarjeta, QR); descuenta inventario; promociones; QR de pago |
| Tirillas y facturas | PDF de tirilla (80 mm) y factura (carta) con logo, colores y datos del negocio (nombre, NIT, dirección, logo) y número consecutivo |
| Reserva rápida | Nombre + celular → reserva, tirilla y recordatorio por WhatsApp (Twilio o WhatsApp Business; sin credenciales queda simulado) |
| Reportes | Diario (cierre del día), semanal y mensual: ventas por cancha, mesa, consumo y método de pago; reservas realizadas y canceladas; PDF y Excel |
| Clientes | Historial de reservas y consumos, cliente frecuente y fidelización (la reserva 8 es gratis) |
| Inventario | Alertas de stock bajo y descuento automático al cobrar |
| Auditoría | Quién, cuándo y qué acción (inicios de sesión y cambios) |
| Respaldo | Descarga de copia completa, copias diarias automáticas (escritorio) y restauración |
| Licencia única | Activación con clave firmada (Ed25519) tras el pago; opcionalmente ligada al equipo |
| Seguridad | scrypt, JWT, autorización por rol, límite de intentos, cabeceras HTTP |

## Estructura
`api/index.js` (API) · `lib/` (módulos) · `public/index.html` + `public/app.js` (aplicación web) · `public/theme.css` (tema global con la identidad visual) · `public/assets` y `public/fonts` (logo y tipografías) · `public/prototipo.html` (prototipo de la Fase 2) · `schema.sql` (23 tablas) · `desktop/main.js` (Electron) · `installer/` (NSIS e Inno Setup) · `scripts/` (respaldo, restauración y licencias) · `tests/` (API, Selenium y Playwright) · `jmeter/fieldpoint.jmx` · `sonar-project.properties`

## Ejecutar en local
```bash
npm install
npm start               # http://localhost:3000 (sin DATABASE_URL usa PostgreSQL embebido en memoria: modo demo)
npm test                # 47 pruebas de la API
npm run test:coverage   # genera coverage/lcov.info para SonarQube
npm run lint
python3 tests/ui_check_playwright.py http://localhost:3000 capturas   # verificación de interfaz (42 casos)
```
Usuarios iniciales: `admin@fieldpoint.co` (Administrador) y `operador@fieldpoint.co` (Operador). Contraseña inicial: `SEED_PASSWORD` (por defecto `FieldPoint2026*`; cámbiela).

## Variables de entorno
| Variable | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL remoto (Neon / Vercel Postgres). Sin ella: modo demo (memoria) |
| `FP_DATA_DIR` | Guarda los datos en disco con PostgreSQL embebido (modo local) |
| `JWT_SECRET`, `SEED_PASSWORD`, `SCRYPT_N` | Seguridad |
| `REQUIRE_LICENSE=1` | Exige licencia activada (la aplicación de escritorio la activa) |
| `LICENSE_PUBLIC_KEY` | Sustituye la clave pública incluida en `lib/license-public.pem` |
| `AUTO_BACKUP_DIR` | Carpeta de copias diarias automáticas |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | WhatsApp por Twilio |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | WhatsApp Business Cloud API |

## Despliegue en Vercel (vercel.app)
1. Suba el proyecto a GitHub y cree un proyecto en vercel.com (Framework Preset: *Other*, sin comando de build).
2. Cree una base PostgreSQL (Neon desde el Marketplace de Vercel) y defina `DATABASE_URL`, `JWT_SECRET` y `SEED_PASSWORD`.
3. Despliegue y verifique `https://<proyecto>.vercel.app/api/health` → `{"ok":true,"db":"postgres"}`.

## Aplicación de escritorio e instalador (Windows)
Ver `installer/LEEME.md`. `npm run desktop` abre la aplicación; `npm run dist` genera el instalador NSIS de un clic (en Windows) y `installer/fieldpoint.iss` el de Inno Setup.

## Licencias (lado del vendedor)
```bash
node scripts/generar-claves.js                                   # una vez; guarde licencia-privada.pem
node scripts/generar-licencia.js licencia-privada.pem "Negocio" "NIT" [id-del-equipo|*]
```
`licencia-demo.txt` solo sirve con la clave pública de demostración incluida: **regenere las claves antes de vender**.

## Pruebas de calidad y carga
- **SonarQube**: `npm run test:coverage` y `sonar-scanner -Dsonar.host.url=<servidor> -Dsonar.token=<token>`.
- **Selenium**: `BASE_URL=https://<proyecto>.vercel.app npm run test:selenium` (Chrome y chromedriver).
- **JMeter 5.x**: `jmeter -n -t jmeter/fieldpoint.jmx -Jhost=<proyecto>.vercel.app -Jport=443 -Jprotocol=https -Jusers=50 -Jramp=60 -Jduration=300 -l resultados.jtl -e -o informe/`

## Tema visual (theme.css)
Un solo archivo, `public/theme.css`, define la identidad del manual para todas las pantallas: variables de color (`--navy`, `--org`, `--ok`, `--err`…), tipografías Montserrat y Open Sans incluidas en `public/fonts` (funciona sin internet), barra lateral en escritorio y navegación inferior en móvil, íconos de línea de un solo estilo, botones con transiciones suaves, mensajes de validación corporativos y modo oscuro. Respeta `prefers-reduced-motion`. Para cambiar la apariencia basta editar las variables del bloque `:root`.

## Mesas: reglas
- Estado: Libre u Ocupada. Ocupar abre una cuenta (con cliente opcional); no se edita el estado a mano.
- Consumos: producto + cliente (por defecto el de la mesa) + cantidad; se acumulan en la cuenta. El stock se reserva entre las mesas abiertas y se descuenta al cerrar.
- Marcar libre solo si no hay consumos. Cerrar genera el comprobante (tirilla o factura), conserva el precio registrado y deja la mesa libre.
- Eliminar una mesa solo es posible si no tiene historial de cuentas.
