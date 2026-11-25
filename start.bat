@echo off
title Kawaki Rapid URL Indexer
cd /d "%~dp0"

echo ======================================================
echo    Starting Kawaki Rapid Indexer Dashboard...
echo ======================================================

if not exist "node_modules\" (
  echo [Setup] Installing required dependencies...
  call npm install
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4040') do (
  taskkill /f /pid %%a >nul 2>&1
)

start http://localhost:4040
node server.js
pause
