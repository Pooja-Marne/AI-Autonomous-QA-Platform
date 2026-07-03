# AI Autonomous QA Platform - One-click Start Script
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI Autonomous QA Platform" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Kill anything already on these ports
Write-Host "[1/3] Clearing ports 3001 and 3002..." -ForegroundColor Yellow
@(3001, 3002) | ForEach-Object {
    $conn = Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "      Freed port $_" -ForegroundColor Gray
    }
}
Start-Sleep -Milliseconds 500

# Start Backend
Write-Host "[2/3] Starting Backend (port 3001)..." -ForegroundColor Yellow
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\backend'; Write-Host 'Backend starting...' -ForegroundColor Cyan; node --experimental-sqlite src/index.js" -PassThru
Start-Sleep -Seconds 3

# Start Frontend
Write-Host "[3/3] Starting Frontend (port 3002)..." -ForegroundColor Yellow
$frontend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\frontend'; Write-Host 'Frontend starting...' -ForegroundColor Cyan; npm run dev" -PassThru
Start-Sleep -Seconds 4

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Both servers started!" -ForegroundColor Green
Write-Host ""
Write-Host "  Dashboard : http://localhost:3002" -ForegroundColor White
Write-Host "  Backend   : http://localhost:3001" -ForegroundColor White
Write-Host "  Health    : http://localhost:3001/health" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Open browser
Start-Process "http://localhost:3002"
Write-Host "Browser opened. Press any key to exit this launcher..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
