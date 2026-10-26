$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$releaseScript = Join-Path $repositoryRoot 'scripts/Deploy-Production.ps1'
$validFixture = Join-Path $PSScriptRoot 'production-release-state.json'
$invalidFixture = Join-Path $PSScriptRoot 'production-release-state-invalid.json'

$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
  $releaseScript,
  [ref]$null,
  [ref]$parseErrors
)
if ($parseErrors.Count) {
  throw "Release script has $($parseErrors.Count) PowerShell parse error(s)"
}

$source = Get-Content -LiteralPath $releaseScript -Raw
if ($source -match '--to-latest') {
  throw 'Release script must never promote the mutable latest revision'
}
$orderedMarkers = @(
  "Deploy backend candidate with zero traffic",
  "Candidate backend readiness",
  "Configure private smoke jobs from candidate image",
  "Promote exact backend revision to 100% traffic",
  "Deploy Firebase frontend preview",
  "Read-only browser smoke against frontend preview",
  "Back up current Firebase live release",
  "Promote tested Firebase preview to live",
  "Full production signup, login, and cleanup smoke"
)
$lastIndex = -1
foreach ($marker in $orderedMarkers) {
  $index = $source.IndexOf($marker)
  if ($index -le $lastIndex) {
    throw "Release stage is missing or out of order: $marker"
  }
  $lastIndex = $index
}
foreach ($requiredText in @(
  '--no-traffic',
  'KEEPINTAX_PRODUCTION_DEPLOY',
  'production-rollback',
  'Assert-BackendTraffic',
  'Production authorization and interactive deployment login',
  "@('auth', 'login')",
  "@('login', '--reauth')",
  "'projects', 'describe'",
  "'projects:list'",
  'gcloud auth login',
  'firebase login --reauth',
  'anti-accident gate'
)) {
  if (!$source.Contains($requiredText)) {
    throw "Release safety marker is missing: $requiredText"
  }
}

$planLines = [System.Collections.Generic.List[string]]::new()
& $releaseScript -Plan -TestStatePath $validFixture *>&1 |
  ForEach-Object { $planLines.Add("$_") }
$planOutput = $planLines -join "`n"
if ($planOutput -notmatch 'r\d{8}-\d{6}-0042') {
  throw 'Plan did not increment the fixture sequence to 0042'
}
if (($planOutput | Select-String '\[START\]' -AllMatches).Matches.Count -ne 2 -or
    ($planOutput | Select-String '\[OK\]' -AllMatches).Matches.Count -ne 2) {
  throw 'Plan did not print START and OK for both read-only stages'
}
if ($planOutput -notmatch 'No changes were made') {
  throw 'Plan did not print its no-write guarantee'
}

$failureLines = [System.Collections.Generic.List[string]]::new()
& $releaseScript -Plan -TestStatePath $invalidFixture *>&1 |
  ForEach-Object { $failureLines.Add("$_") }
$failureExitCode = $LASTEXITCODE
$failureOutput = $failureLines -join "`n"
if ($failureExitCode -ne 1) {
  throw "Invalid traffic fixture returned exit code $failureExitCode instead of 1"
}
if ($failureOutput -notmatch '\[FAILED\].*Read production state' -or
    $failureOutput -notmatch 'Expected exactly one backend revision') {
  throw 'Failure output did not include the exact stage and reason'
}

try {
  & $releaseScript -Apply -TestStatePath $validFixture
  throw 'Fixture-backed apply unexpectedly succeeded'
} catch {
  if ($_.Exception.Message -notmatch 'cannot be used with Apply') { throw }
}

$global:LASTEXITCODE = 0
Write-Output 'Deploy-Production tests passed'
