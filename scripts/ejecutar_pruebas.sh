#!/usr/bin/env bash
# Ejecuta la batería de pruebas de FieldPoint y guarda los registros en ./evidencias
# Requisitos: Node 20+, PostgreSQL (opcional, para las pruebas con base real), Python con playwright, k6 (opcional).
# Variables opcionales: PGURL (por ejemplo postgres://fp:fp@localhost:5432/fieldpoint), CHROMEDRIVER_PATH, CHROME_BIN
set -u
cd "$(dirname "$0")/.."
OUT=evidencias; mkdir -p "$OUT/capturas" coverage
export SCRYPT_N=1024 JWT_SECRET=pruebas
fecha() { date -u '+%Y-%m-%d %H:%M UTC'; }

echo "== 1. API con cobertura (base embebida)"
{ echo "# $(fecha) · npm run test:coverage"; npm run test:coverage 2>&1; } > "$OUT/01_api_cobertura.log"; grep -E "^ℹ (tests|pass|fail)" "$OUT/01_api_cobertura.log"

if [ -n "${PGURL:-}" ]; then
  echo "== 2. API contra PostgreSQL"
  { echo "# $(fecha) · PostgreSQL"; for f in api mejoras mesas; do echo "## $f"; DATABASE_URL="$PGURL" PGSSL=off node --test tests/$f.test.js 2>&1 | grep -E "^ok|^not ok|^# (tests|pass|fail)"; done; } > "$OUT/02_api_postgresql.log"
fi

echo "== 3. Calidad de código"
{ echo "# $(fecha) · ESLint"; npx eslint . ; echo "salida: $?"; } > "$OUT/03_eslint.log" 2>&1
{ echo "# $(fecha) · duplicación (jscpd) y dependencias (npm audit)"; npx jscpd api lib public server.js --min-lines 6 --min-tokens 60 --reporters console --silent 2>&1 | tail -3; npm audit 2>&1 | tail -3; } > "$OUT/06_duplicacion_y_dependencias.log"
[ -f eslint.sonar.config.cjs ] && { echo "# $(fecha) · reglas SonarJS (requiere: npm i --no-save eslint-plugin-sonarjs)"; npx eslint -c eslint.sonar.config.cjs api lib public server.js desktop scripts 2>&1; } > "$OUT/04_sonarjs.log"

echo "== 4. Interfaz (Playwright) – requiere el servidor en marcha: PORT=3000 node server.js"
python3 tests/ui_check_playwright.py http://localhost:${PORT:-3000} "$OUT/capturas" 2>&1 | tee "$OUT/07_playwright_ui.log" | tail -1

echo "== 5. Selenium"
BASE_URL=http://localhost:${PORT:-3000} node --test tests/selenium/crud.test.js 2>&1 | tee "$OUT/08_selenium.log" | grep -E "^# (tests|pass|fail)"

if command -v k6 >/dev/null; then
  echo "== 6. Carga (50 usuarios)"
  k6 run -e BASE_URL=http://localhost:${PORT:-3000} -e PERFIL=carga --summary-export="$OUT/09_k6_carga_resumen.json" k6/fieldpoint.js > "$OUT/09_k6_carga.log" 2>&1
  echo "== 7. Estrés (hasta 300 usuarios)"
  k6 run -e BASE_URL=http://localhost:${PORT:-3000} -e PERFIL=estres --summary-export="$OUT/10_k6_estres_resumen.json" k6/fieldpoint.js > "$OUT/10_k6_estres.log" 2>&1
fi
echo "Listo: registros en $OUT/"
