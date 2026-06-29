@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required on this PC.
  echo Install Node.js 20 or newer from https://nodejs.org/.
  pause
  exit /b 1
)

if not exist dist\server\index.js (
  echo App is not built yet. Running install / repair first...
  call Install-Or-Repair-Team-KPI-Tracker.bat
)

set PORT=4174
echo Starting Team KPI Tracker on http://127.0.0.1:%PORT%
echo Close this window to stop the app.
start "" "http://127.0.0.1:%PORT%"
node dist\server\index.js
