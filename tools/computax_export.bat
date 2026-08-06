@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0computax_bridge.ps1" -Mode AutoExport -OutputPath "%~dp0computax_clients.json"
echo.
echo Computax export completed.
echo Export saved at:
echo %~dp0computax_clients.json
echo.
pause
