; Instalador con Inno Setup. Pasos: 1) npm run dist:dir (genera dist\win-unpacked)  2) compilar este script con Inno Setup 6.
#define AppName "Tablero"
#define AppVersion "1.0.0"
[Setup]
AppId={{6B1E2A1C-4F52-4C7B-9D0E-3F1A5E7D9A10}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Tablero
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
OutputDir=..\dist
OutputBaseFilename=Tablero-Setup-{#AppVersion}
SetupIconFile=..\assets\icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"; Flags: checkedonce
[Files]
Source: "..\dist\win-unpacked\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\Tablero.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\Tablero.exe"; Tasks: desktopicon
[Run]
Filename: "{app}\Tablero.exe"; Description: "Abrir Tablero"; Flags: nowait postinstall skipifsilent
