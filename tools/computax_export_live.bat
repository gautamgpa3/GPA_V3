@echo off
setlocal

set /p PARTY_SELECTION_URL=Paste current Computax partyselection URL:

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0computax_bridge.ps1" -Mode AutoExport -PartySelectionUrl "%PARTY_SELECTION_URL%" -OutputPath "%~dp0computax_clients.json" > "%~dp0computax_export_result.json"

echo Computax live Master export completed.
echo Result:
echo %~dp0computax_export_result.json
echo JSON:
echo %~dp0computax_clients.json
pause
