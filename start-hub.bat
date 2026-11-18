@echo off
rem Projekt-Hub starten (Windows): holt zuerst Updates, dann startet der Server.
cd /d "%~dp0"
title Projekt-Hub
where git >nul 2>nul
if %errorlevel%==0 (
  echo Suche Updates...
  git pull --ff-only || echo Update nicht moeglich - starte mit der vorhandenen Version.
) else (
  echo Git nicht gefunden - starte ohne Update.
)
where node >nul 2>nul
if not %errorlevel%==0 (
  echo Node.js fehlt. Bitte installieren: https://nodejs.org
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
echo.
echo Hub laeuft auf http://localhost:3000 - dieses Fenster offen lassen.
node server.js
pause
