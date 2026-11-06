@echo off
rem Двойной щелчок — запуск сайта Kampela через PowerShell
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-site.ps1" %*
if errorlevel 1 pause
