@echo off
REM Ejecutar el servidor Node.js
start cmd /k "cd /d .\agromisa-printer-server-v2\ && init.bat"

REM Ejecutar el servidor Python
start cmd /k "cd /d .\python-escpos\ && init.bat"
