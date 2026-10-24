# Instalador de escritorio de Tablero (Windows)

Hay dos formas de generar el instalador; ambas se construyen **en un computador con Windows**.

## Opción A: NSIS con electron-builder (instalación con un clic)
Electron y electron-builder no vienen en las dependencias para que Vercel no los descargue; instálelos una vez:
```bash
npm install
npm install --save-dev electron electron-builder
npm run dist          # genera dist\Tablero Setup 1.0.0.exe
```
## Opción B: Inno Setup
```bash
npm run dist:dir      # genera dist\win-unpacked
```
Convierta `public/assets/icon.png` a `assets/icon.ico` (cree la carpeta `assets`) y compile `installer/tablero.iss` con Inno Setup 6.

## Primer uso
1. Instalar y abrir Tablero. En el primer inicio muestra una contraseña inicial aleatoria para los usuarios de ejemplo.
2. Ir a **Negocio y licencia**: completar nombre, NIT, dirección y logo, y pegar la **licencia** recibida tras el pago.
3. Los datos quedan en la carpeta del usuario (`%APPDATA%\Tablero\datos`) y las copias diarias en `...\respaldos`.

## Licencia (lado del vendedor)
```bash
node scripts/generar-claves.js                              # una sola vez; guarde licencia-privada.pem en secreto
node scripts/generar-licencia.js licencia-privada.pem "Negocio" "NIT" [id-del-equipo|*]
```
El comprador envía el «identificador del equipo» que muestra la pantalla de licencia; si se usa `*` la licencia sirve en cualquier equipo.
**Antes de vender, regenere el par de claves**: `licencia-demo.txt` solo funciona con la clave pública de demostración incluida.

## Verificación realizada
- La aplicación de escritorio se abrió con Electron en Linux y pasó 7 de 7 verificaciones (licencia, datos locales, respaldo diario y persistencia): `python3 tests/desktop_check.py capturas`.
- El paquete de Windows (`Tablero-1.0.0-win.zip`, 173 MB, x64) se construyó desde Linux con `electron-builder`. **No se probó en Windows.**
- El instalador `Tablero Setup 1.0.0.exe` (NSIS) no se pudo terminar en Linux porque requiere Wine; en Windows se genera directamente con `npm run dist`.
- El ícono usa `build/icon.png` (512 px).
