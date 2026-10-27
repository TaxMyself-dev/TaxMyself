$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$releaseScript = Join-Path $repositoryRoot 'scripts/Deploy-Production.ps1'
$validFixture = Join-Path $PSScriptRoot 'production-release-state.json'
$invalidFixture = Join-Path $PSScriptRoot 'production-release-state-invalid.json'
$configureJobsScript = Join-Path $repositoryRoot 'smoke-tests/configure-cloud-run-jobs.ps1'
$inspectSourceScript = Join-Path $repositoryRoot 'smoke-tests/inspect-cloud-run-source.ps1'
$cloudRunFixture = Join-Path $repositoryRoot 'smoke-tests/tests/fixtures/cloud-run-service.json'
$plainCloudRunFixture = Join-Path $repositoryRoot 'smoke-tests/tests/fixtures/cloud-run-service-plain-env.json'
$gitignore = Join-Path $repositoryRoot '.gitignore'

function Invoke-FixtureScriptWithStrictMode([string]$ScriptPath, [string]$FixturePath) {
  Set-StrictMode -Version Latest
  return (& $ScriptPath -SourceJsonPath $FixturePath | Out-String)
}

function Get-NamedFunctionInvoker([string]$ScriptPath, [string]$FunctionName) {
  $tokens = $null
  $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $ScriptPath,
    [ref]$tokens,
    [ref]$errors
  )
  if ($errors.Count) { throw "$ScriptPath has PowerShell parse errors" }
  $functionAst = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq $FunctionName
  }, $true)
  if ($null -eq $functionAst) { throw "Function $FunctionName was not found in $ScriptPath" }
  return [scriptblock]::Create(
    "param([hashtable]`$Values)`n$($functionAst.Extent.Text)`n$FunctionName `$Values"
  )
}

function Get-NamedFunctionTextInvoker([string]$ScriptPath, [string[]]$FunctionNames, [string]$EntryFunction) {
  $tokens = $null
  $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $ScriptPath,
    [ref]$tokens,
    [ref]$errors
  )
  if ($errors.Count) { throw "$ScriptPath has PowerShell parse errors" }
  $definitions = foreach ($functionName in $FunctionNames) {
    $functionAst = $ast.Find({
      param($node)
      $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -eq $functionName
    }, $true)
    if ($null -eq $functionAst) { throw "Function $functionName was not found in $ScriptPath" }
    $functionAst.Extent.Text
  }
  return [scriptblock]::Create(
    "param([string]`$Text)`n$($definitions -join "`n")`n$EntryFunction `$Text"
  )
}

$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
  $releaseScript,
  [ref]$null,
  [ref]$parseErrors
)
if ($parseErrors.Count) {
  throw "Release script has $($parseErrors.Count) PowerShell parse error(s)"
}

$gitignoreSource = Get-Content -LiteralPath $gitignore -Raw
if ($gitignoreSource -notmatch '(?m)^/firebase-debug\*\.log\r?$') {
  throw 'Firebase CLI debug logs must be ignored so a failed auth check does not dirty the release tree'
}
if ($gitignoreSource -notmatch '(?m)^/deployment-logs/\r?$') {
  throw 'Detailed deployment logs must be ignored so they do not dirty release preflight'
}

# The release script enables strict mode before invoking these child scripts.
# Cloud Run omits valueFrom for ordinary env entries and may omit optional
# network annotations, so both shapes must remain safe in that exact context.
$mixedPlan = Invoke-FixtureScriptWithStrictMode $configureJobsScript $cloudRunFixture | ConvertFrom-Json
if ($mixedPlan.jobs.Count -ne 2 -or $mixedPlan.securityWarnings.Count -ne 0) {
  throw 'Strict-mode smoke job plan did not preserve mixed plain/secret environment entries'
}
$plainPlan = Invoke-FixtureScriptWithStrictMode $configureJobsScript $plainCloudRunFixture | ConvertFrom-Json
if ($plainPlan.jobs.Count -ne 2 -or $plainPlan.securityWarnings.Count -ne 3) {
  throw 'Strict-mode smoke job plan did not preserve plain environment entries'
}
$plainInventory = Invoke-FixtureScriptWithStrictMode $inspectSourceScript $plainCloudRunFixture | ConvertFrom-Json
if (!$plainInventory.readyToConfigureJobs -or
    $plainInventory.network.vpcConnectorConfigured -or
    $plainInventory.network.vpcEgress -ne 'default') {
  throw 'Strict-mode source inventory did not handle omitted optional properties'
}

$dictionaryInvoker = Get-NamedFunctionInvoker $configureJobsScript 'Get-GcloudDictionary'
$encodedDictionary = & $dictionaryInvoker @{
  SECOND = 'base64-value=='
  FIRST = 'plain'
}

$cloudErrorInvoker = Get-NamedFunctionTextInvoker $releaseScript @(
  'Get-OptionalProperty',
  'Protect-ReleaseDiagnostic',
  'Get-CloudRunErrorSummaryFromJson'
) 'Get-CloudRunErrorSummaryFromJson'
$cloudErrorFixture = @'
[
  {
    "severity": "ERROR",
    "textPayload": "throw new Error(`Catalog integrity failure`);"
  },
  {
    "severity": "ERROR",
    "textPayload": "Error: Catalog integrity failure: token=top-secret password:also-secret\n    at bootstrap (/app/dist/main.js:74:5)"
  },
  {
    "severity": "ERROR",
    "textPayload": "Default STARTUP TCP probe failed 1 time consecutively."
  }
]
'@
$cloudErrorSummary = & $cloudErrorInvoker $cloudErrorFixture
if ($cloudErrorSummary -notmatch '^Error: Catalog integrity failure:' -or
    $cloudErrorSummary -notmatch 'token=\[REDACTED\]' -or
    $cloudErrorSummary -notmatch 'password:\[REDACTED\]' -or
    $cloudErrorSummary -match 'top-secret|also-secret|bootstrap|STARTUP TCP') {
  throw "Cloud Run startup summary was not concise and redacted: $cloudErrorSummary"
}
if ($encodedDictionary -ne 'FIRST=plain,SECOND=base64-value==') {
  throw "Unexpected gcloud dictionary encoding: $encodedDictionary"
}
try {
  [void](& $dictionaryInvoker @{ UNSAFE = 'contains,comma' })
  throw 'Unsafe gcloud dictionary value unexpectedly succeeded'
} catch {
  if ($_.Exception.Message -notmatch 'unsupported delimiter') { throw }
}

$source = Get-Content -LiteralPath $releaseScript -Raw
if ($source -match '\$output\s*=\s*&\s*\$Command\s+@Arguments\s+2>&1') {
  throw 'Native JSON capture must not merge stderr warnings into stdout'
}
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
  "'logging', 'read'"
  'resource.labels.revision_name'
  'Cloud Run revision startup failed'
)) {
  if (!$source.Contains($requiredText)) {
    throw "Release safety marker is missing: $requiredText"
  }
}

$planLines = [System.Collections.Generic.List[string]]::new()
& $releaseScript -Plan -TestStatePath $validFixture *>&1 |
  ForEach-Object { $planLines.Add("$_") }
$planOutput = $planLines -join "`n"
if (($planOutput | Select-String '\[START\]' -AllMatches).Matches.Count -ne 2 -or
    ($planOutput | Select-String '\[COMPLETE\]' -AllMatches).Matches.Count -ne 2) {
  throw 'Plan did not print START and COMPLETE for both read-only stages'
}
if ($planOutput -notmatch 'No changes were made') {
  throw 'Plan did not print its no-write guarantee'
}
if ($planOutput -match 'Using local test-state fixture' -or
    $planOutput -match 'Current backend revision' -or
    $planOutput -match 'Fixture detail output' -or
    $planOutput -match 'Fixture native stderr' -or
    $planOutput -match 'Fixture captured stderr' -or
    $planOutput -match 'Fixture native non-zero') {
  throw 'Plan leaked detailed stage output to the terminal'
}
$planLogLine = $planLines | Where-Object { $_ -match '^Detailed log: ' } | Select-Object -First 1
if (!$planLogLine) { throw 'Plan did not print its detailed log path' }
$planLogPath = $planLogLine.Substring('Detailed log: '.Length)
if (!(Test-Path -LiteralPath $planLogPath)) { throw 'Plan detailed log file was not created' }
$planLog = Get-Content -LiteralPath $planLogPath -Raw
if ($planLog -notmatch 'Using local test-state fixture' -or
    $planLog -notmatch 'Fixture detail output is routed to the release log' -or
    $planLog -notmatch 'Fixture native stderr is informational' -or
    $planLog -notmatch 'Fixture captured stderr is informational' -or
    $planLog -notmatch 'Fixture native non-zero exit was detected correctly' -or
    $planLog -notmatch 'Current backend revision' -or
    $planLog -notmatch 'Install pinned dependencies' -or
    $planLog -notmatch 'r\d{8}-\d{6}-0042') {
  throw 'Plan detailed log is missing stage or plan details'
}
Remove-Item -LiteralPath $planLogPath -Force

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
if ($failureOutput -match 'CategoryInfo|ScriptStackTrace|FullyQualifiedErrorId') {
  throw 'Failure output leaked the verbose PowerShell error record to the terminal'
}
$failureLogLine = $failureLines | Where-Object { $_ -match '^Detailed log: ' } | Select-Object -First 1
if (!$failureLogLine) { throw 'Failed plan did not print its detailed log path' }
$failureLogPath = $failureLogLine.Substring('Detailed log: '.Length)
if (!(Test-Path -LiteralPath $failureLogPath)) { throw 'Failed plan detailed log file was not created' }
$failureLog = Get-Content -LiteralPath $failureLogPath -Raw
if ($failureLog -notmatch 'Expected exactly one backend revision' -or
    $failureLog -notmatch 'status.*failed') {
  throw 'Failed plan detailed log is missing its failure diagnostics or summary'
}
Remove-Item -LiteralPath $failureLogPath -Force

try {
  & $releaseScript -Apply -TestStatePath $validFixture
  throw 'Fixture-backed apply unexpectedly succeeded'
} catch {
  if ($_.Exception.Message -notmatch 'cannot be used with Apply') { throw }
}

$global:LASTEXITCODE = 0
Write-Output 'Deploy-Production tests passed'
