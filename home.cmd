@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "PUBLIC_DIR=%SCRIPT_DIR%public"

if not exist "%PUBLIC_DIR%" (
  echo public directory not found in %SCRIPT_DIR% 1>&2
  exit /b 2
)

cd /d "%PUBLIC_DIR%"

echo =============================================
echo       Weekly Project Home Local Server
echo =============================================
echo   -^> Serving folder: %PUBLIC_DIR%

:: Try python in PATH
python --version >nul 2>&1
if %errorlevel% equ 0 (
  echo   -^> Launching browser to http://127.0.0.1:4000 ...
  echo   -^> Press Ctrl+C in this terminal to stop.
  echo =============================================
  start /b "" powershell -Command "Start-Sleep -m 800; Start-Process 'http://127.0.0.1:4000'"
  python -m http.server 4000 --bind 127.0.0.1
  exit /b %errorlevel%
)

:: Try py in PATH
py --version >nul 2>&1
if %errorlevel% equ 0 (
  echo   -^> Launching browser to http://127.0.0.1:4000 ...
  echo   -^> Press Ctrl+C in this terminal to stop.
  echo =============================================
  start /b "" powershell -Command "Start-Sleep -m 800; Start-Process 'http://127.0.0.1:4000'"
  py -m http.server 4000 --bind 127.0.0.1
  exit /b %errorlevel%
)

:: Try npx in PATH
where npx >nul 2>nul
if %errorlevel% equ 0 (
  echo   -^> Python not found. Falling back to Node.js ^(npx serve^)...
  echo   -^> Launching browser to http://127.0.0.1:4000 ...
  echo   -^> Press Ctrl+C in this terminal to stop.
  echo =============================================
  start /b "" powershell -Command "Start-Sleep -m 800; Start-Process 'http://127.0.0.1:4000'"
  npx --yes serve -l 4000
  exit /b %errorlevel%
)

echo Neither Python nor Node.js ^(npx^) was found in PATH. Please install Python or Node.js to run the local server. 1>&2
exit /b 9009
