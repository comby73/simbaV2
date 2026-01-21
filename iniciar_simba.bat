@echo off
TITLE SIMBA V2 - Servidor Local
color 0A
echo.
echo  ============================================
echo     SIMBA V2 - Sistema de Control Loterias
echo  ============================================
echo.

:: Verificar si Node.js está instalado
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Node.js no esta instalado o no esta en el PATH.
    echo  Por favor, instala Node.js desde https://nodejs.org/
    pause
    exit
)

:: Mostrar version de Node
echo  [OK] Node.js detectado: 
node -v
echo.

:: Verificar si existe la carpeta node_modules
if not exist "node_modules\" (
    echo  [INFO] Instalando dependencias...
    call npm install
    echo.
)

:: Verificar MySQL de XAMPP
echo  [TIP] Asegurate que MySQL de XAMPP este ENCENDIDO
echo.
echo  ============================================
echo   Selecciona modo de inicio:
echo  ============================================
echo   1. Desarrollo (con auto-reload)
echo   2. Produccion (sin auto-reload)
echo   3. Solo ejecutar migracion de BD
echo   4. Salir
echo  ============================================
echo.
set /p opcion="  Opcion [1-4]: "

if "%opcion%"=="1" (
    echo.
    echo  [DEV] Iniciando en modo DESARROLLO...
    echo  [URL] http://localhost:3000
    echo  [TIP] Los cambios se recargan automaticamente
    echo.
    npm run dev
)
if "%opcion%"=="2" (
    echo.
    echo  [PROD] Iniciando en modo PRODUCCION...
    echo  [URL] http://localhost:3000
    echo.
    npm start
)
if "%opcion%"=="3" (
    echo.
    echo  [DB] Ejecutando migraciones...
    echo.
    node database/migration_programacion.js
    echo.
    pause
    goto :eof
)
if "%opcion%"=="4" (
    exit
)

pause
