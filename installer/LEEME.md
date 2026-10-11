# Instalador de escritorio de FieldPoint (Windows)

Hay dos formas de generar el instalador; ambas se construyen **en un computador con Windows**.

## Opción A: NSIS con electron-builder (instalación con un clic)
```bash
npm install
npm run dist          # genera dist\FieldPoint Setup 1.0.0.exe
```
## Opción B: Inno Setup
```bash
npm run dist:dir      # genera dist\win-unpacked
```
Convierta `assets/icon.png` a `assets/icon.ico` y compile `installer/fieldpoint.iss` con Inno Setup 6.

## Primer uso
1. Instalar y abrir FieldPoint. En el primer inicio muestra una contraseña inicial aleatoria para los usuarios de ejemplo.
2. Ir a **Negocio y licencia**: completar nombre, NIT, dirección y logo, y pegar la **licencia** recibida tras el pago.
3. Los datos quedan en la carpeta del usuario (`%APPDATA%\FieldPoint\datos`) y las copias diarias en `...\respaldos`.

## Licencia (lado del vendedor)
```bash
node scripts/generar-claves.js                              # una sola vez; guarde licencia-privada.pem en secreto
node scripts/generar-licencia.js licencia-privada.pem "Negocio" "NIT" [id-del-equipo|*]
```
El comprador envía el «identificador del equipo» que muestra la pantalla de licencia; si se usa `*` la licencia sirve en cualquier equipo.
**Antes de vender, regenere el par de claves**: `licencia-demo.txt` solo funciona con la clave pública de demostración incluida.
