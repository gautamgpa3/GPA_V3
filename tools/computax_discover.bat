@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0computax_bridge.ps1" -Mode Discover > "%~dp0computax_discover_result.json"
echo.
echo Computax discovery completed.
echo Result saved at:
echo %~dp0computax_discover_result.json
echo.
pause
