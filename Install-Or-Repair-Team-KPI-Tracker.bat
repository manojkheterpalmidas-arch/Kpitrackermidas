@echo off
setlocal
cd /d "%~dp0"

echo Team KPI Tracker - install / repair
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required on this PC.
  echo Install Node.js 20 or newer from https://nodejs.org/, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing app dependencies...
  where pnpm >nul 2>nul
  if errorlevel 1 (
    echo pnpm was not found. Trying to enable it with Corepack...
    corepack enable
    corepack prepare pnpm@11.7.0 --activate
  )
  pnpm install --ignore-scripts --config.confirmModulesPurge=false
  if errorlevel 1 (
    echo.
    echo Dependency install failed. Check internet access or install pnpm manually.
    pause
    exit /b 1
  )
)

echo Building the app...
node node_modules\typescript\bin\tsc -p tsconfig.json
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Install / repair complete.
echo Run Start-Team-KPI-Tracker.bat to open the app.
pause
