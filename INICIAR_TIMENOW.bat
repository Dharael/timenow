@echo off
title TimeNow - Clima y Sismos
cd /d "%~dp0"
echo.
echo   ============================================
echo      TIMENOW - Estacion de Monitoreo
echo      Abriendo http://localhost:4800 ...
echo   ============================================
echo.
start "" "http://localhost:4800"
node server.js
pause
