param(
    [switch]$KeepData
)

Write-Host ""
Write-Host "  Running e2e tests..." -ForegroundColor Yellow
Write-Host ""

if ($KeepData) { $env:KEEP_TEST_DATA = "true" }

$output = npm run test:e2e 2>&1
$exitCode = $LASTEXITCODE

# Extract log path written by the custom reporter
$logLine = $output | Where-Object { "$_" -match '__LOG_PATH__:(.+)' } | Select-Object -First 1
$logPath = if ("$logLine" -match '__LOG_PATH__:(.+)') { $Matches[1].Trim() } else { $null }

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "  ALL TESTS PASSED" -ForegroundColor Green
} else {
    Write-Host "  TESTS FAILED" -ForegroundColor Red
}

if ($logPath -and (Test-Path $logPath)) {
    Write-Host "  Log: $logPath" -ForegroundColor Cyan
} else {
    Write-Host "  (log file not found - check test output above)" -ForegroundColor DarkYellow
    $output | Write-Host
}
Write-Host ""

if ($KeepData) { Remove-Item Env:\KEEP_TEST_DATA -ErrorAction SilentlyContinue }
