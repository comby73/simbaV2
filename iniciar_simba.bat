@echo off
TITLE SIMBA V2 - Servidor Local
echo ==========================================
echo    INICIANDO SIMBA V2 (DENTRO DE XAMPP)
echo ==========================================
echo.

:: Verificar si Node.js está instalado
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado o no esta en el PATH.
    echo Por favor, instala Node.js desde https://nodejs.org/
    pause
    exit
)

:: Verificar si existe la carpeta node_modules, si no, instalar dependencias
if not exist "node_modules\" (
    echo [INFO] No se encontro node_modules. Instalando dependencias...
    call npm install
)

:: Iniciar la aplicación
echo [OK] Iniciando el servidor en http://localhost:3000
echo [TIP] Asegurate de que MySQL en XAMPP este encendido.
echo.
npm start

pause
