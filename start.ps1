# Kawaki Rapid URL Indexer Launcher
Set-Location -Path $PSScriptRoot

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   Starting Kawaki Rapid Indexer Dashboard...         " -ForegroundColor Yellow
Write-Host "======================================================" -ForegroundColor Cyan

Start-Process "http://localhost:4040"
node server.js
