@echo off
setlocal
cd /d "%~dp0"
start "Diligent Code Studio Dev" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-DiligentCodeStudio-Dev.ps1"
exit /b 0
