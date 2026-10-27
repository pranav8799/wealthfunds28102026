@echo off
setlocal
cd /d "%~dp0"
echo ==============================================
echo Packaging Calling CRM for BigRock cPanel...
echo ==============================================

echo [1/4] Building React client bundle...
cd client
call npm run build
if %errorlevel% neq 0 (
    echo Error: Client build failed.
    exit /b %errorlevel%
)
cd ..

echo [2/4] Copying build to server/dist...
if not exist "server\dist" mkdir "server\dist"
xcopy /E /I /Y "client\dist" "server\dist" > nul

echo [3/4] Preparing deploy package...
set TEMP_DIR=deploy-temp
if exist "%TEMP_DIR%" rmdir /S /Q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"
xcopy /E /I /Y "server\src" "%TEMP_DIR%\src" > nul
xcopy /E /I /Y "server\dist" "%TEMP_DIR%\dist" > nul
copy "server\package.json" "%TEMP_DIR%\package.json" > nul
copy "server\package-lock.json" "%TEMP_DIR%\package-lock.json" > nul
copy "server\app.js" "%TEMP_DIR%\app.js" > nul
copy "server\.env.example" "%TEMP_DIR%\.env.example" > nul
if exist "server\make-sql.js" copy "server\make-sql.js" "%TEMP_DIR%\make-sql.js" > nul

if exist "calling-crm-cpanel.zip" del /F /Q "calling-crm-cpanel.zip"

echo [4/4] Creating calling-crm-cpanel.zip...
powershell -NoProfile -Command "Compress-Archive -Path '%TEMP_DIR%\*' -DestinationPath 'calling-crm-cpanel.zip' -Force"
rmdir /S /Q "%TEMP_DIR%"

echo.
echo ==============================================
echo SUCCESS! Package created: calling-crm-cpanel.zip
echo You can upload this zip file directly to your BigRock cPanel.
echo ==============================================
