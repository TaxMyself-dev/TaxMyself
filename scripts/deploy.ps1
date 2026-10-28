<#
.SYNOPSIS
Executes a guarded full, backend-only, or frontend-only KeepInTax production
release.

.DESCRIPTION
The script verifies a clean main branch, builds and tests all relevant
packages, deploys a zero-traffic Cloud Run candidate, checks its real
production readiness, configures the private smoke jobs from the exact
candidate image, promotes backend traffic, tests the frontend in a Firebase
preview channel, promotes that exact version to live, and runs full signup
smoke coverage. Post-promotion failures trigger best-effort frontend and
backend rollback while preserving the original failed stage and reason.

Target defaults to Full. SkipLocalTests omits only the local backend Jest and
smoke configuration test suites. Production builds, candidate readiness,
browser smoke, full live signup/login/cleanup smoke, and rollback protections
remain mandatory.

.NOTES
Authentication:
No password is accepted or stored by this script. The first stage opens
interactive login for the deployment CLIs required by the selected target:

  gcloud auth login
  firebase login --reauth

Git uses the machine's existing Git Credential Manager/session. After login,
preflight performs read-only authorization checks and stops before build/deploy
if a session is missing, expired, or lacks access to taxmyself-prod.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('Full', 'Backend', 'Frontend')]
  [string]$Target = 'Full',
  [switch]$SkipLocalTests,
  [string]$Project = 'taxmyself-prod',
  [string]$Region = 'me-west1',
  [string]$BackendService = 'taxmys16elf-prod',
  [string]$HostingSite = 'taxmyself-prod',
  [string]$PublicApiUrl = 'https://taxmys16elf-prod-tau7bgxb3q-zf.a.run.app',
  [string]$BrowserChannel = 'chrome',
  [Parameter(DontShow)]
  [string]$TestStatePath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:StageNumber = 0
$script:StageResults = [System.Collections.Generic.List[object]]::new()
$script:CurrentStage = 'initialization'
$script:BackendPromoted = $false
$script:FrontendDeploymentStarted = $false
$script:FrontendBackupCreated = $false
$script:OldBackendRevision = $null
$script:CandidateRevision = $null
$script:CandidateUrl = $null
$script:CandidateImage = $null
$script:PreviewUrl = $null
$script:ReleaseDirectory = $null
$script:ReleaseId = $null
$script:BackupChannel = 'production-rollback'
$script:GitCommand = $null
$script:GcloudCommand = $null
$script:FirebaseCommand = $null
$script:NpmCommand = $null
$script:PowerShellCommand = $null
$script:QuietConsole = $false
$script:LogWriter = $null
$script:LogPath = $null

function Write-ReleaseLog([object]$Record) {
  if ($null -eq $script:LogWriter) { return }
  $text = if ($Record -is [System.Management.Automation.ErrorRecord]) {
    $Record | Format-List * -Force | Out-String -Width 4096
  } else {
    [string]$Record
  }
  foreach ($line in @($text -split "`r?`n")) {
    $script:LogWriter.WriteLine($line)
  }
}

function Write-ReleaseStatus([string]$State, [string]$Message, [ConsoleColor]$Color) {
  $timestamp = Get-Date -Format 'HH:mm:ss'
  $line = "[$timestamp] [$State] $Message"
  Write-ReleaseLog $line
  if (!$script:QuietConsole) {
    Write-Host $line -ForegroundColor $Color
  }
}

function Invoke-Stage([string]$Name, [scriptblock]$Action) {
  $script:StageNumber++
  $script:CurrentStage = $Name
  $started = Get-Date
  Write-ReleaseStatus 'START' "Stage $($script:StageNumber): $Name" Cyan
  try {
    $script:QuietConsole = $true
    try {
      & $Action | ForEach-Object { Write-ReleaseLog $_ }
    } finally {
      $script:QuietConsole = $false
    }
    $duration = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
    $script:StageResults.Add([ordered]@{ stage = $Name; status = 'ok'; seconds = $duration })
    Write-ReleaseStatus 'COMPLETE' "Stage $($script:StageNumber): $Name (${duration}s)" Green
  } catch {
    $script:QuietConsole = $false
    $duration = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
    $reason = $_.Exception.Message
    Write-ReleaseLog $_
    $script:StageResults.Add([ordered]@{ stage = $Name; status = 'failed'; seconds = $duration; reason = $reason })
    Write-ReleaseStatus 'FAILED' "Stage $($script:StageNumber): $Name (${duration}s) - $reason" Red
    throw
  }
}

function Invoke-Native([string]$Command, [string[]]$Arguments) {
  # Windows PowerShell 5.1 turns native stderr into NativeCommandError when it
  # is redirected. Many successful CLIs (gcloud, Firebase, npm) write routine
  # progress to stderr, so log both streams and trust the native exit code.
  $previousErrorActionPreference = $ErrorActionPreference
  $safeFatal = [pscustomobject]@{ Reason = $null }
  try {
    $ErrorActionPreference = 'Continue'
    & $Command @Arguments 2>&1 | ForEach-Object {
      $line = [string]$_
      Write-ReleaseLog $line
      if ($line -match '^\[SMOKE FATAL\]\s+(.+)$') {
        $safeFatal.Reason = $Matches[1]
      }
    }
    $nativeExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($nativeExitCode -ne 0) {
    if ($safeFatal.Reason) {
      throw $safeFatal.Reason
    }
    throw "$Command failed with exit code $nativeExitCode"
  }
}

function Invoke-NativeCapture([string]$Command, [string[]]$Arguments) {
  # Capture stdout only. Some CLIs (notably Firebase under newer Node versions)
  # print deprecation warnings to stderr even on success; merging that stream
  # into JSON output makes valid responses impossible to parse.
  $stdout = [System.Collections.Generic.List[string]]::new()
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $Command @Arguments 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) {
        Write-ReleaseLog ([string]$_)
      } else {
        $stdout.Add([string]$_)
      }
    }
    $nativeExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($nativeExitCode -ne 0) {
    throw "$Command failed with exit code $nativeExitCode"
  }
  return ($stdout -join "`n")
}

function Get-CommandName([string]$Name) {
  $windowsName = "$Name.cmd"
  if ($env:OS -eq 'Windows_NT' -and (Get-Command $windowsName -ErrorAction SilentlyContinue)) {
    return $windowsName
  }
  if (Get-Command $Name -ErrorAction SilentlyContinue) { return $Name }
  throw "Required command '$Name' was not found"
}

function Assert-CloudName([string]$Name, [string]$Value) {
  if ($Value -notmatch '^[a-z][a-z0-9-]{0,62}$') {
    throw "$Name is not a valid Google Cloud resource name"
  }
}

function Get-OptionalProperty([object]$InputObject, [string]$Name, $DefaultValue = $null) {
  if ($null -eq $InputObject) { return $DefaultValue }
  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) { return $DefaultValue }
  return $property.Value
}

function Get-CloudRunErrorSummaryFromJson([string]$Json) {
  if ([string]::IsNullOrWhiteSpace($Json)) { return $null }
  try {
    $parsed = $Json | ConvertFrom-Json
    # Windows PowerShell 5.1 can return a top-level JSON array as one nested
    # pipeline object. Force explicit enumeration so each log entry is scored.
    $entries = if ($parsed -is [System.Array]) {
      @($parsed | ForEach-Object { $_ })
    } else {
      @($parsed)
    }
  } catch {
    return $null
  }

  foreach ($entry in $entries) {
    $message = [string](Get-OptionalProperty $entry 'textPayload' '')
    if ([string]::IsNullOrWhiteSpace($message)) {
      $jsonPayload = Get-OptionalProperty $entry 'jsonPayload'
      $message = [string](Get-OptionalProperty $jsonPayload 'message' '')
    }
    $firstLine = [string](@($message -split "`r?`n" | Where-Object { $_.Trim() }) |
      Select-Object -First 1)

    # Do not sanitize and forward arbitrary text. Accept only a complete,
    # known-safe shape and reconstruct it from tightly constrained captures.
    if ($firstLine -match '^Error: Catalog integrity failure: (?<count>\d+) active booking_account row\(s\) have empty visibleBusinessTypes \(sample codes: (?<codes>\d+(?:,\s*\d+){0,9})\)\. Run the visible-business-types backfill before startup\.$') {
      $count = [int]$Matches['count']
      $codes = $Matches['codes']
      return "Error: Catalog integrity failure: $count active booking_account row(s) have empty visibleBusinessTypes (sample codes: $codes). Run the visible-business-types backfill before startup."
    }
  }
  return $null
}

function Get-CloudRunRevisionErrorSummary([string]$Revision) {
  $filter =
    "resource.type=`"cloud_run_revision`" AND " +
    "resource.labels.service_name=`"$BackendService`" AND " +
    "resource.labels.revision_name=`"$Revision`" AND severity>=ERROR AND " +
    "(textPayload=~`"^Error: Catalog integrity failure:`" OR " +
    "jsonPayload.message=~`"^Error: Catalog integrity failure:`")"
  try {
    # Cloud Logging can trail the failed deploy response briefly. Retry only
    # an empty result; authorization/CLI failures fall through immediately.
    foreach ($attempt in 1..3) {
      $json = Invoke-NativeCapture $script:GcloudCommand @(
        'logging', 'read', $filter,
        "--project=$Project",
        '--limit=50',
        '--order=asc',
        '--format=json'
      )
      $summary = Get-CloudRunErrorSummaryFromJson $json
      if ($summary) {
        Write-ReleaseLog "Cloud Run startup cause: $summary"
        return $summary
      }
      if ($attempt -lt 3) { Start-Sleep -Seconds 2 }
    }
    Write-ReleaseLog "No allowlisted startup diagnostic was available for revision $Revision"
  } catch {
    Write-ReleaseLog "Could not read ERROR logs for revision ${Revision}: $($_.Exception.Message)"
  }
  return $null
}

function Get-TrafficPercent([object]$TrafficTarget) {
  return [int](Get-OptionalProperty $TrafficTarget 'percent' 0)
}

function Get-NextReleaseSequence([string[]]$RevisionNames) {
  $escapedService = [regex]::Escape($BackendService)
  $numbers = @(
    $RevisionNames | ForEach-Object {
      if ($_ -match "^${escapedService}-r\d{8}-\d{6}-(\d+)$") {
        [int]$Matches[1]
      }
    }
  )
  if ($numbers.Count -eq 0) { return 1 }
  return (($numbers | Measure-Object -Maximum).Maximum + 1)
}

function Assert-BackendTraffic([string]$ExpectedRevision) {
  $json = Invoke-NativeCapture $script:GcloudCommand @(
    'run', 'services', 'describe', $BackendService,
    "--project=$Project",
    "--region=$Region",
    '--format=json'
  )
  $state = $json | ConvertFrom-Json
  $active = @($state.status.traffic | Where-Object { (Get-TrafficPercent $_) -gt 0 })
  if ($active.Count -ne 1 -or
      (Get-TrafficPercent $active[0]) -ne 100 -or
      (Get-OptionalProperty $active[0] 'revisionName') -ne $ExpectedRevision) {
    throw "Backend traffic is not 100% on expected revision $ExpectedRevision"
  }
}

function Remove-ReleaseDirectory {
  if (!$script:ReleaseDirectory -or !(Test-Path -LiteralPath $script:ReleaseDirectory)) { return }
  $resolved = (Resolve-Path -LiteralPath $script:ReleaseDirectory).Path
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
  if (!$resolved.StartsWith("$tempRoot$([IO.Path]::DirectorySeparatorChar)keepintax-release-")) {
    throw "Refusing to remove unexpected release directory: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

$deployBackend = $Target -in @('Full', 'Backend')
$deployFrontend = $Target -in @('Full', 'Frontend')

foreach ($item in @{
  Project = $Project
  Region = $Region
  BackendService = $BackendService
  HostingSite = $HostingSite
}.GetEnumerator()) {
  Assert-CloudName $item.Key $item.Value
}
$parsedPublicApiUrl = $null
if (![uri]::TryCreate($PublicApiUrl, [UriKind]::Absolute, [ref]$parsedPublicApiUrl) -or
    $parsedPublicApiUrl.Scheme -ne 'https') {
  throw 'PublicApiUrl must be an absolute HTTPS URL'
}
$PublicApiUrl = $parsedPublicApiUrl.AbsoluteUri

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$testFixtureRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'tests')).TrimEnd('\', '/') +
  [IO.Path]::DirectorySeparatorChar
if ($TestStatePath) {
  $resolvedTestStatePath = (Resolve-Path -LiteralPath $TestStatePath).Path
  if (!$resolvedTestStatePath.StartsWith($testFixtureRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'TestStatePath is restricted to repository deployment fixtures'
  }
  $TestStatePath = $resolvedTestStatePath
}
$backendDirectory = Join-Path $repositoryRoot 'backend'
$frontendDirectory = Join-Path $repositoryRoot 'frontend'
$smokeDirectory = Join-Path $repositoryRoot 'smoke-tests'
$configureJobsScript = Join-Path $smokeDirectory 'configure-cloud-run-jobs.ps1'
$candidateReadinessScript = Join-Path $smokeDirectory 'run-candidate-readiness.ps1'
$productionSmokeScript = Join-Path $smokeDirectory 'run-production-smoke.ps1'
$logDirectory = Join-Path $repositoryRoot 'deployment-logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$script:LogPath = Join-Path $logDirectory "production-release-$logTimestamp-$PID.log"
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
$script:LogWriter = New-Object System.IO.StreamWriter($script:LogPath, $false, $utf8WithoutBom)
$script:LogWriter.AutoFlush = $true
$script:PowerShellCommand = (Get-Process -Id $PID).Path
Write-ReleaseLog "KeepInTax production release log"
Write-ReleaseLog "Started: $((Get-Date).ToString('o'))"
Write-ReleaseLog 'Mode: Deploy'
Write-ReleaseLog "Target: $Target"
Write-ReleaseLog "Local tests: $(if ($SkipLocalTests) { 'skipped by operator' } else { 'required' })"
Write-ReleaseLog "Project: $Project"
Write-Host "Detailed log: $($script:LogPath)" -ForegroundColor DarkGray

try {
  # Authenticate interactively with the systems that perform the selected
  # deployment. The CLIs manage their own tokens; this script never receives
  # or stores a password. Fixture-backed regression tests skip cloud access.
  if (!$TestStatePath) {
    Invoke-Stage 'Production authorization and interactive deployment login' {
      $script:GcloudCommand = Get-CommandName 'gcloud'
      if ($deployFrontend) {
        $script:FirebaseCommand = Get-CommandName 'firebase'
      }

      Write-ReleaseStatus 'INFO' 'Opening Google Cloud login for release operations' DarkGray
      Invoke-Native $script:GcloudCommand @('auth', 'login')

      if ($deployFrontend) {
        Write-ReleaseStatus 'INFO' 'Opening Firebase login for the frontend deployment' DarkGray
        Invoke-Native $script:FirebaseCommand @('login', '--reauth')
      }
    }
  }

  # Fail early unless the operator, repository, and CLI sessions are
  # safe for a production release. This stage performs read-only checks only.
  Invoke-Stage 'Preflight: clean main branch and required tools' {
    if ($TestStatePath) {
      if (!(Test-Path -LiteralPath $TestStatePath)) { throw 'Test state fixture was not found' }
      Write-ReleaseStatus 'INFO' 'Using local test-state fixture; no cloud command will run' DarkGray
      Write-Output 'Fixture detail output is routed to the release log'
      Invoke-Native $script:PowerShellCommand @(
        '-NoProfile',
        '-Command',
        "[Console]::Error.WriteLine('Fixture native stderr is informational'); exit 0"
      )
      $fixtureCapture = Invoke-NativeCapture $script:PowerShellCommand @(
        '-NoProfile',
        '-Command',
        "[Console]::Out.WriteLine('fixture-stdout'); [Console]::Error.WriteLine('Fixture captured stderr is informational'); exit 0"
      )
      if ($fixtureCapture.Trim() -ne 'fixture-stdout') {
        throw 'Native stdout-only fixture capture was contaminated by stderr'
      }
      try {
        Invoke-Native $script:PowerShellCommand @('-NoProfile', '-Command', 'exit 7')
        throw 'Native non-zero fixture unexpectedly succeeded'
      } catch {
        if ($_.Exception.Message -notmatch 'failed with exit code 7') { throw }
        Write-Output 'Fixture native non-zero exit was detected correctly'
      }
      try {
        Invoke-Native $script:PowerShellCommand @(
          '-NoProfile',
          '-Command',
          "[Console]::Error.WriteLine('[SMOKE FATAL] Fixture safe smoke reason'); exit 9"
        )
        throw 'Native safe-fatal fixture unexpectedly succeeded'
      } catch {
        if ($_.Exception.Message -ne 'Fixture safe smoke reason') { throw }
        Write-Output 'Fixture safe smoke reason was promoted correctly'
      }
      return
    }
    $script:GitCommand = Get-CommandName 'git'
    $script:GcloudCommand = Get-CommandName 'gcloud'
    if ($deployFrontend) {
      $script:FirebaseCommand = Get-CommandName 'firebase'
    }
    $script:NpmCommand = Get-CommandName 'npm'
    Set-Location $repositoryRoot
    $branch = (Invoke-NativeCapture $script:GitCommand @('branch', '--show-current')).Trim()
    if ($branch -ne 'main') { throw "Production deployment requires main; current branch is $branch" }
    $dirty = Invoke-NativeCapture $script:GitCommand @('status', '--porcelain')
    if ($dirty.Trim()) {
      throw 'Uncommitted changes found. Commit or stash them, then retry'
    }
    Invoke-Native $script:GitCommand @('fetch', 'origin')
    $head = (Invoke-NativeCapture $script:GitCommand @('rev-parse', 'HEAD')).Trim()
    $originMain = (Invoke-NativeCapture $script:GitCommand @('rev-parse', 'origin/main')).Trim()
    if ($head -ne $originMain) { throw 'Local main must exactly match origin/main' }

    $activeAccount = (Invoke-NativeCapture $script:GcloudCommand @('auth', 'list', '--filter=status:ACTIVE', '--format=value(account)')).Trim()
    if (!$activeAccount) {
      throw "No active gcloud account was found. Run 'gcloud auth login'"
    }
    Write-ReleaseStatus 'INFO' "Authenticated gcloud account: $activeAccount" DarkGray

    try {
      $authorizedProject = (Invoke-NativeCapture $script:GcloudCommand @(
        'projects', 'describe', $Project,
        '--format=value(projectId)'
      )).Trim()
    } catch {
      throw "gcloud authentication/authorization check failed for $Project. Run 'gcloud auth login' and verify project access"
    }
    if ($authorizedProject -ne $Project) {
      throw "gcloud did not resolve the expected project $Project"
    }

    if ($deployFrontend) {
      try {
        $firebaseProjectsJson = Invoke-NativeCapture $script:FirebaseCommand @(
          'projects:list',
          '--json',
          '--non-interactive'
        )
        $firebaseProjects = $firebaseProjectsJson | ConvertFrom-Json
        $firebaseProjectIds = @($firebaseProjects.result | ForEach-Object { $_.projectId })
      } catch {
        throw "Firebase authentication/authorization check failed for $Project. Run 'firebase login --reauth' and verify project access"
      }
      if ($Project -notin $firebaseProjectIds) {
        throw "Firebase CLI is authenticated but cannot access project $Project"
      }
    }
  }

  # Read the currently serving backend revision and calculate the next release
  # identity. Script-created revision names are the durable sequence source.
  Invoke-Stage 'Read production state and allocate release tag' {
    if ($TestStatePath) {
      $testState = Get-Content -LiteralPath $TestStatePath -Raw | ConvertFrom-Json
      $revisionNames = @($testState.revisionNames)
      $serviceState = $testState.serviceState
    } else {
      $revisionText = Invoke-NativeCapture $script:GcloudCommand @(
        'run', 'revisions', 'list',
        "--service=$BackendService",
        "--project=$Project",
        "--region=$Region",
        '--format=value(metadata.name)'
      )
      $revisionNames = @($revisionText -split "`r?`n" | Where-Object { $_.Trim() })
      $serviceJson = Invoke-NativeCapture $script:GcloudCommand @(
        'run', 'services', 'describe', $BackendService,
        "--project=$Project",
        "--region=$Region",
        '--format=json'
      )
      $serviceState = $serviceJson | ConvertFrom-Json
    }
    $sequence = [int](Get-NextReleaseSequence $revisionNames)
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $script:ReleaseId = "r$timestamp-$($sequence.ToString('D4'))"

    $activeTraffic = @($serviceState.status.traffic | Where-Object { (Get-TrafficPercent $_) -gt 0 })
    if ($activeTraffic.Count -ne 1 -or
        (Get-TrafficPercent $activeTraffic[0]) -ne 100 -or
        !(Get-OptionalProperty $activeTraffic[0] 'revisionName')) {
      throw 'Expected exactly one backend revision receiving 100% traffic'
    }
    $script:OldBackendRevision = [string](Get-OptionalProperty $activeTraffic[0] 'revisionName')
    Write-ReleaseStatus 'INFO' "Release tag: $($script:ReleaseId)" DarkGray
    Write-ReleaseStatus 'INFO' "Current backend revision: $($script:OldBackendRevision)" DarkGray
  }

  if ($TestStatePath) {
    Write-ReleaseStatus 'TEST' 'Fixture validation completed; no production changes were made' Yellow
    $plannedStages = [System.Collections.Generic.List[string]]::new()
    if ($deployBackend) {
      $plannedStages.Add('Install pinned backend dependencies, run the selected local verification, and build')
      $plannedStages.Add('Create a clean backend source snapshot from the current commit')
      $plannedStages.Add('Deploy a tagged backend revision with zero production traffic')
      $plannedStages.Add('Run /ready against the tagged candidate URL')
      $plannedStages.Add('Create or update private verification and cleanup jobs from the exact candidate image')
      $plannedStages.Add('Move 100% backend traffic to the exact candidate revision')
    }
    if ($deployFrontend) {
      $plannedStages.Add('Build the production frontend')
    }
    $plannedStages.Add('Install smoke dependencies and run the selected local verification')
    if ($deployFrontend) {
      $plannedStages.Add('Deploy the frontend to a Firebase preview channel and run read-only browser smoke')
      $plannedStages.Add('Clone the current Firebase live release to the production-rollback channel')
      $plannedStages.Add('Promote the exact tested preview version to Firebase live')
    }
    $plannedStages.Add('Run the full production signup/login/cleanup smoke suite')
    $plannedStages | ForEach-Object { Write-ReleaseLog "  - $_" }
    Write-ReleaseLog "Target: $Target"
    Write-ReleaseLog "Local tests: $(if ($SkipLocalTests) { 'skipped; builds and production gates remain required' } else { 'required' })"
    Write-ReleaseLog "Fixture release: $($script:ReleaseId)"
    return
  }

  # Install exactly the locked backend dependencies, run the full Jest suite,
  # and prove the Nest production bundle compiles before touching the cloud.
  if ($deployBackend) { Invoke-Stage 'Backend dependencies, tests, and production build' {
    Push-Location $backendDirectory
    try {
      Invoke-Native $script:NpmCommand @('ci')
      if ($SkipLocalTests) {
        Write-Output 'Skipping backend Jest suite by explicit operator request'
      } else {
        Invoke-Native $script:NpmCommand @('test', '--', '--runInBand')
      }
      Invoke-Native $script:NpmCommand @('run', 'build')
    } finally { Pop-Location }
  } }

  # Build the Angular production output that will later be uploaded to a
  # preview channel and, only after browser verification, cloned to live.
  if ($deployFrontend) { Invoke-Stage 'Frontend dependencies and production build' {
    Push-Location $frontendDirectory
    try {
      Invoke-Native $script:NpmCommand @('ci')
      Invoke-Native $script:NpmCommand @('run', 'build', '--', '--configuration', 'production')
      if (!(Test-Path -LiteralPath (Join-Path $frontendDirectory 'dist/app/index.html'))) {
        throw 'Frontend production build did not create dist/app/index.html'
      }
    } finally { Pop-Location }
  } }

  # Validate the external Playwright package and its guarded configuration.
  # Browser tests against production do not run yet.
  Invoke-Stage 'Smoke dependencies and local configuration tests' {
    Push-Location $smokeDirectory
    try {
      Invoke-Native $script:NpmCommand @('ci')
      if ($SkipLocalTests) {
        Write-Output 'Skipping smoke configuration unit tests by explicit operator request'
      } else {
        Invoke-Native $script:NpmCommand @('test')
      }
    } finally { Pop-Location }
  }

  # Package backend source from the verified Git commit, never from mutable
  # working-tree files. Secrets, dependencies, and build output are excluded.
  if ($deployBackend) { Invoke-Stage 'Create clean backend source snapshot' {
    Set-Location $repositoryRoot
    $dirty = Invoke-NativeCapture $script:GitCommand @('status', '--porcelain')
    if ($dirty.Trim()) { throw 'Working tree changed during verification; refusing to deploy' }
    $commit = (Invoke-NativeCapture $script:GitCommand @('rev-parse', 'HEAD')).Trim()
    $script:ReleaseDirectory = Join-Path ([IO.Path]::GetTempPath()) "keepintax-release-$($script:ReleaseId)"
    if (Test-Path -LiteralPath $script:ReleaseDirectory) {
      throw "Release directory already exists: $($script:ReleaseDirectory)"
    }
    New-Item -ItemType Directory -Path $script:ReleaseDirectory | Out-Null
    $archive = Join-Path $script:ReleaseDirectory 'backend.zip'
    $source = Join-Path $script:ReleaseDirectory 'backend-source'
    Invoke-Native $script:GitCommand @('archive', '--format=zip', "--output=$archive", "${commit}:backend")
    Expand-Archive -LiteralPath $archive -DestinationPath $source
    @('.git', 'node_modules', 'dist', '.env', '.env.*', '*.key', '*.pem') |
      Set-Content -LiteralPath (Join-Path $source '.gcloudignore') -Encoding ascii
  } }

  # Build/deploy a new immutable Cloud Run revision with a direct tag URL but
  # keep all public production traffic on the previously serving revision.
  if ($deployBackend) { Invoke-Stage 'Deploy backend candidate with zero traffic' {
    $source = Join-Path $script:ReleaseDirectory 'backend-source'
    $expectedRevision = "$BackendService-$($script:ReleaseId)"
    try {
      Invoke-Native $script:GcloudCommand @(
        'run', 'deploy', $BackendService,
        "--source=$source",
        "--project=$Project",
        "--region=$Region",
        "--revision-suffix=$($script:ReleaseId)",
        "--tag=$($script:ReleaseId)",
        '--no-traffic',
        '--quiet'
      )
    } catch {
      $deployError = $_
      $startupCause = Get-CloudRunRevisionErrorSummary $expectedRevision
      if ($startupCause) {
        throw "Cloud Run revision startup failed: $startupCause"
      }
      throw $deployError
    }
    $candidateJson = Invoke-NativeCapture $script:GcloudCommand @(
      'run', 'services', 'describe', $BackendService,
      "--project=$Project",
      "--region=$Region",
      '--format=json'
    )
    $candidateState = $candidateJson | ConvertFrom-Json
    $script:CandidateRevision = [string]$candidateState.status.latestCreatedRevisionName
    if (!$script:CandidateRevision -or $script:CandidateRevision -ne $candidateState.status.latestReadyRevisionName) {
      throw 'The candidate revision was created but is not ready'
    }
    if ($script:CandidateRevision -ne $expectedRevision) {
      throw "Unexpected candidate revision: $($script:CandidateRevision)"
    }
    $candidateTraffic = @($candidateState.status.traffic | Where-Object {
      (Get-OptionalProperty $_ 'tag') -eq $script:ReleaseId
    })
    if ($candidateTraffic.Count -ne 1) { throw 'Tagged candidate traffic target is missing or ambiguous' }
    $script:CandidateUrl = [string](Get-OptionalProperty $candidateTraffic[0] 'url')
    $script:CandidateImage = [string]@($candidateState.spec.template.spec.containers)[0].image
    if (!$script:CandidateUrl.StartsWith('https://')) { throw 'Tagged candidate URL is missing' }
    if ($script:CandidateImage -notmatch '^.+@sha256:[0-9a-f]{64}$') {
      throw 'Candidate image is not an immutable sha256 reference'
    }
    $activeTraffic = @($candidateState.status.traffic | Where-Object { (Get-TrafficPercent $_) -gt 0 })
    if ($activeTraffic.Count -ne 1 -or
        (Get-TrafficPercent $activeTraffic[0]) -ne 100 -or
        (Get-OptionalProperty $activeTraffic[0] 'revisionName') -ne $script:OldBackendRevision) {
      $script:BackendPromoted = $true
      throw 'The zero-traffic deployment unexpectedly changed production traffic'
    }
    Write-ReleaseStatus 'INFO' "Candidate revision: $($script:CandidateRevision)" DarkGray
    Write-ReleaseStatus 'INFO' "Candidate URL: $($script:CandidateUrl)" DarkGray
  } }

  # Call /ready on the candidate tag URL. This checks the candidate's actual
  # production DB connection and signup-critical schema before promotion.
  if ($deployBackend) { Invoke-Stage 'Candidate backend readiness' {
    Invoke-Native $script:PowerShellCommand @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', $candidateReadinessScript,
      '-ApiUrl', $script:CandidateUrl,
      '-BrowserChannel', $BrowserChannel
    )
  } }

  # Create/update the private Firebase verification and cleanup jobs from the
  # exact candidate image digest. Neither job is executed in this stage.
  if ($deployBackend) { Invoke-Stage 'Configure private smoke jobs from candidate image' {
    $previousGate = $env:SMOKE_CONFIGURE_JOBS
    try {
      $env:SMOKE_CONFIGURE_JOBS = $Project
      Invoke-Native $script:PowerShellCommand @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $configureJobsScript,
        '-Project', $Project,
        '-Region', $Region,
        '-SourceService', $BackendService,
        '-Image', $script:CandidateImage,
        '-Apply'
      )
    } finally {
      $env:SMOKE_CONFIGURE_JOBS = $previousGate
    }
  } }

  # Move traffic to the explicit candidate revision, then read Cloud Run state
  # back and verify that it alone receives 100% (never promote LATEST).
  if ($deployBackend) { Invoke-Stage 'Promote exact backend revision to 100% traffic' {
    Invoke-Native $script:GcloudCommand @(
      'run', 'services', 'update-traffic', $BackendService,
      "--to-revisions=$($script:CandidateRevision)=100",
      "--project=$Project",
      "--region=$Region",
      '--quiet'
    )
    $script:BackendPromoted = $true
    Assert-BackendTraffic $script:CandidateRevision
  } }

  # Upload the already-built frontend to an expiring preview channel. Live
  # users still receive the old Firebase Hosting version at this point.
  if ($deployFrontend) { Invoke-Stage 'Deploy Firebase frontend preview' {
    Set-Location $repositoryRoot
    $previewOutput = Invoke-NativeCapture $script:FirebaseCommand @(
      'hosting:channel:deploy', $script:ReleaseId,
      '--only', 'app',
      "--project=$Project",
      '--expires', '1d',
      '--non-interactive',
      '--json'
    )
    $previewMatch = [regex]::Match($previewOutput, 'https://[a-z0-9-]+(?:--[a-z0-9-]+)?\.web\.app')
    if (!$previewMatch.Success) {
      throw 'Firebase preview deployed but its HTTPS URL could not be resolved from CLI output'
    }
    $script:PreviewUrl = $previewMatch.Value
    Write-ReleaseStatus 'INFO' "Frontend preview URL: $($script:PreviewUrl)" DarkGray
  } }

  # Open the preview with Playwright and verify registration UI/API wiring
  # without creating a user or modifying production application data.
  if ($deployFrontend) { Invoke-Stage 'Read-only browser smoke against frontend preview' {
    $previousWebUrl = $env:SMOKE_WEB_URL
    $previousApiUrl = $env:SMOKE_API_URL
    $previousBrowser = $env:SMOKE_BROWSER_CHANNEL
    try {
      $env:SMOKE_WEB_URL = $script:PreviewUrl
      $env:SMOKE_API_URL = $PublicApiUrl
      $env:SMOKE_BROWSER_CHANNEL = $BrowserChannel
      Push-Location $smokeDirectory
      try {
        Invoke-Native $script:NpmCommand @('run', 'smoke:readonly')
      } finally { Pop-Location }
    } finally {
      $env:SMOKE_WEB_URL = $previousWebUrl
      $env:SMOKE_API_URL = $previousApiUrl
      $env:SMOKE_BROWSER_CHANNEL = $previousBrowser
    }
  } }

  # Preserve the exact currently-live Hosting version in a fixed rollback
  # channel immediately before changing the live frontend.
  if ($deployFrontend) { Invoke-Stage 'Back up current Firebase live release' {
    Invoke-Native $script:FirebaseCommand @(
      'hosting:clone', "${HostingSite}:live", "${HostingSite}:$($script:BackupChannel)",
      "--project=$Project",
      '--non-interactive'
    )
    $script:FrontendBackupCreated = $true
  } }

  # Promote by cloning the exact preview version that passed browser smoke;
  # do not rebuild or upload a different set of frontend files.
  if ($deployFrontend) { Invoke-Stage 'Promote tested Firebase preview to live' {
    $script:FrontendDeploymentStarted = $true
    Invoke-Native $script:FirebaseCommand @(
      'hosting:clone', "${HostingSite}:$($script:ReleaseId)", "${HostingSite}:live",
      "--project=$Project",
      '--non-interactive'
    )
  } }

  # Exercise the real public flow: readiness, UI, signup, private verification,
  # login/dashboard, and guaranteed private cleanup.
  Invoke-Stage 'Full production signup, login, and cleanup smoke' {
    $previousGate = $env:SMOKE_RUN_PRODUCTION
    try {
      $env:SMOKE_RUN_PRODUCTION = 'app.keepintax.co.il'
      Invoke-Native $script:PowerShellCommand @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $productionSmokeScript,
        '-ApiUrl', $PublicApiUrl,
        '-BrowserChannel', $BrowserChannel
      )
    } finally {
      $env:SMOKE_RUN_PRODUCTION = $previousGate
    }
  }

  Write-ReleaseStatus 'SUCCESS' "Production release $($script:ReleaseId) completed" Green
  Write-ReleaseLog ($script:StageResults | Format-Table -AutoSize | Out-String -Width 4096)
} catch {
  $originalError = $_.Exception.Message
  $failedStage = $script:CurrentStage

  if ($script:CandidateRevision -and !$script:BackendPromoted) {
    Write-ReleaseStatus 'SAFE' "Candidate $($script:CandidateRevision) was not promoted; existing production traffic remains unchanged" Yellow
  }

  # If live Hosting may have changed, restore the version saved immediately
  # before promotion. Report rollback failure separately from the root cause.
  if ($script:FrontendDeploymentStarted -and $script:FrontendBackupCreated) {
    try {
      Invoke-Stage 'ROLLBACK: restore previous Firebase live release' {
        Invoke-Native $script:FirebaseCommand @(
          'hosting:clone', "${HostingSite}:$($script:BackupChannel)", "${HostingSite}:live",
          "--project=$Project",
          '--non-interactive'
        )
      }
    } catch {
      Write-ReleaseStatus 'ROLLBACK FAILED' "Frontend rollback failed: $($_.Exception.Message)" Red
    }
  }

  # If backend traffic may have moved, restore the exact old revision and
  # verify Cloud Run reports it at 100% again.
  if ($script:BackendPromoted -and $script:OldBackendRevision) {
    try {
      Invoke-Stage 'ROLLBACK: restore previous backend revision' {
        Invoke-Native $script:GcloudCommand @(
          'run', 'services', 'update-traffic', $BackendService,
          "--to-revisions=$($script:OldBackendRevision)=100",
          "--project=$Project",
          "--region=$Region",
          '--quiet'
        )
        Assert-BackendTraffic $script:OldBackendRevision
      }
    } catch {
      Write-ReleaseStatus 'ROLLBACK FAILED' "Backend rollback failed: $($_.Exception.Message)" Red
    }
  }

  # Return a real non-zero process status without making PowerShell repeat the
  # same failure as a long stack trace. Invoke-Stage already printed the exact
  # failed stage and reason above.
  Write-ReleaseLog ($script:StageResults | Format-Table -AutoSize | Out-String -Width 4096)
  exit 1
} finally {
  Set-Location $repositoryRoot
  try { Remove-ReleaseDirectory } catch {
    Write-ReleaseStatus 'WARNING' "Temporary release cleanup failed: $($_.Exception.Message)" Yellow
  }
  if ($null -ne $script:LogWriter) {
    Write-ReleaseLog "Finished: $((Get-Date).ToString('o'))"
    $script:LogWriter.Dispose()
    $script:LogWriter = $null
  }
}
