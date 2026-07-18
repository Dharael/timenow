@echo off
title TimeNow - PUBLICO (servidor + link para compartir)
cd /d "%~dp0"
echo.
echo   ============================================================
echo      TIMENOW - Estacion de Monitoreo (MODO PUBLICO)
echo   ============================================================
echo.
echo   [1/3] Arrancando servidor local...
start "TimeNow Servidor" /min cmd /c "node server.js"
timeout /t 3 /nobreak >nul

echo   [2/3] Creando link publico con Cloudflare Tunnel...
del /q tunnel.log 2>nul
start "TimeNow Tunel" /min cmd /c "cloudflared.exe tunnel --url http://localhost:4800 --protocol http2 > tunnel.log 2>&1"

echo   [3/3] Esperando el link (10-20 segundos)...
:espera
timeout /t 2 /nobreak >nul
findstr /r "trycloudflare\.com" tunnel.log >nul 2>&1
if errorlevel 1 goto espera

for /f "delims=" %%a in ('powershell -NoProfile -Command "(Select-String -Path tunnel.log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1).Matches[0].Value"') do set "URL=%%a"

echo.
echo   ============================================================
echo      LISTO. Comparte este link (funciona en cualquier celular):
echo.
echo      %URL%
echo.
echo      OJO: el link cambia cada vez que ejecutes este archivo.
echo      Cierra esta ventana para APAGAR el link publico.
echo   ============================================================
echo.
start "" "http://localhost:4800"
pause >nul
taskkill /im cloudflared.exe /f >nul 2>&1
