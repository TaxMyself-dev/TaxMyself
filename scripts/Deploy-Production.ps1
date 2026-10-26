<#
.SYNOPSIS
Plans or executes a guarded KeepInTax production release.

.DESCRIPTION
The script verifies a clean main branch, builds and tests all relevant
packages, deploys a zero-traffic Cloud Run candidate, checks its real
production readiness, configures the private smoke jobs from the exact
candidate image, promotes backend traffic, tests the frontend in a Firebase
preview channel, promotes that exact version to live, and runs full signup
smoke coverage. Post-promotion failures trigger best-effort frontend and
backend rollback while preserving the original failed stage and reason.

Plan mode is the default and performs no production writes. Apply mode also
requires KEEPINTAX_PRODUCTION_DEPLOY=taxmyself-prod.

.NOTES
Authentication:
No password is accepted or stored by this script. The first Apply stage opens
interactive login for both deployment CLIs:

  gcloud auth login
  firebase login --reauth

Git uses the machine's existing Git Credential Manager/session. After login,
preflight performs read-only authorization checks and stops before build/deploy
if a session is missing, expired, or lacks access to taxmyself-prod. Plan mode
does not open an interactive login and only validates existing sessions.
#>
[CmdletBinding()]
param(
  [switch]$Plan,
  [switch]$Apply,
  [string]$Project = 'taxmyself-prod',
  [string]$Region = 'me-west1',
  [string]$BackendService = 'taxmys16elf-prod',
  [string]$HostingSite = 'taxmyself-prod',
  [string]$PublicApiUrl = 'https://taxmys16elf-prod-tau7bgxb3q-zf.a.run.app',
  [string]$BrowserChannel = 'chrome',
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

function Write-ReleaseStatus([string]$State, [string]$Message, [ConsoleColor]$Color) {
  $timestamp = Get-Date -Format 'HH:mm:ss'
  Write-Host "[$timestamp] [$State] $Message" -ForegroundColor $Color
}

function Invoke-Stage([string]$Name, [scriptblock]$Action) {
  $script:StageNumber++
  $script:CurrentStage = $Name
  $started = Get-Date
  Write-ReleaseStatus 'START' "Stage $($script:StageNumber): $Name" Cyan
  try {
    & $Action
    $duration = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
    $script:StageResults.Add([ordered]@{ stage = $Name; status = 'ok'; seconds = $duration })
    Write-ReleaseStatus 'OK' "Stage $($script:StageNumber): $Name (${duration}s)" Green
  } catch {
    $duration = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
    $reason = $_.Exception.Message
    $script:StageResults.Add([ordered]@{ stage = $Name; status = 'failed'; seconds = $duration; reason = $reason })
    Write-ReleaseStatus 'FAILED' "Stage $($script:StageNumber): $Name (${duration}s) - $reason" Red
    throw
  }
}

function Invoke-Native([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

function Invoke-NativeCapture([string]$Command, [string[]]$Arguments) {
  # Capture stdout only. Some CLIs (notably Firebase under newer Node versions)
  # print deprecation warnings to stderr even on success; merging that stream
  # into JSON output makes valid responses impossible to parse.
  $output = & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
  return ($output -join "`n")
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
  $active = @($state.status.traffic | Where-Object { $_.percent -gt 0 })
  if ($active.Count -ne 1 -or
      $active[0].percent -ne 100 -or
      $active[0].revisionName -ne $ExpectedRevision) {
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

if ($Plan -and $Apply) { throw 'Choose either Plan or Apply, not both' }
if (!$Plan -and !$Apply) { $Plan = $true }
if ($TestStatePath -and $Apply) { throw 'TestStatePath cannot be used with Apply' }

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
$backendDirectory = Join-Path $repositoryRoot 'backend'
$frontendDirectory = Join-Path $repositoryRoot 'frontend'
$smokeDirectory = Join-Path $repositoryRoot 'smoke-tests'
$configureJobsScript = Join-Path $smokeDirectory 'configure-cloud-run-jobs.ps1'
$candidateReadinessScript = Join-Path $smokeDirectory 'run-candidate-readiness.ps1'
$productionSmokeScript = Join-Path $smokeDirectory 'run-production-smoke.ps1'

try {
  # Apply stage 1: Require the anti-accident gate, then authenticate
  # interactively with the two systems that perform the backend and frontend
  # deployments. The CLIs manage their own tokens; this script never receives
  # or stores a password. Plan mode deliberately skips interactive login.
  if ($Apply) {
    Invoke-Stage 'Production authorization and interactive deployment login' {
      if ($env:KEEPINTAX_PRODUCTION_DEPLOY -ne $Project) {
        throw "Set KEEPINTAX_PRODUCTION_DEPLOY=$Project before using -Apply"
      }

      $script:GcloudCommand = Get-CommandName 'gcloud'
      $script:FirebaseCommand = Get-CommandName 'firebase'

      Write-ReleaseStatus 'INFO' 'Opening Google Cloud login for the backend deployment' DarkGray
      Invoke-Native $script:GcloudCommand @('auth', 'login')

      Write-ReleaseStatus 'INFO' 'Opening Firebase login for the frontend deployment' DarkGray
      Invoke-Native $script:FirebaseCommand @('login', '--reauth')
    }
  }

  # Fail early unless the operator, repository, and CLI sessions are
  # safe for a production release. This stage performs read-only checks only.
  Invoke-Stage 'Preflight: clean main branch and required tools' {
    if ($TestStatePath) {
      if (!(Test-Path -LiteralPath $TestStatePath)) { throw 'Test state fixture was not found' }
      Write-ReleaseStatus 'INFO' 'Using local test-state fixture; no external command will run' DarkGray
      return
    }
    $script:GitCommand = Get-CommandName 'git'
    $script:GcloudCommand = Get-CommandName 'gcloud'
    $script:FirebaseCommand = Get-CommandName 'firebase'
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

    $activeTraffic = @($serviceState.status.traffic | Where-Object { $_.percent -gt 0 })
    if ($activeTraffic.Count -ne 1 -or $activeTraffic[0].percent -ne 100 -or !$activeTraffic[0].revisionName) {
      throw 'Expected exactly one backend revision receiving 100% traffic'
    }
    $script:OldBackendRevision = [string]$activeTraffic[0].revisionName
    Write-ReleaseStatus 'INFO' "Release tag: $($script:ReleaseId)" DarkGray
    Write-ReleaseStatus 'INFO' "Current backend revision: $($script:OldBackendRevision)" DarkGray
  }

  if ($Plan) {
    Write-Host ''
    Write-ReleaseStatus 'PLAN' 'No changes were made. Apply will run these stages:' Yellow
    @(
      'Install pinned dependencies and run backend tests/build',
      'Build the production frontend and validate smoke tooling',
      'Create a clean backend source snapshot from the current commit',
      'Deploy a tagged backend revision with zero production traffic',
      'Run /ready against the tagged candidate URL',
      'Create or update private verification and cleanup jobs from the exact candidate image',
      'Move 100% backend traffic to the exact candidate revision',
      'Deploy the frontend to a Firebase preview channel and run read-only browser smoke',
      'Clone the current Firebase live release to the production-rollback channel',
      'Promote the exact tested preview version to Firebase live',
      'Run the full production signup/login/cleanup smoke suite'
    ) | ForEach-Object { Write-Host "  - $_" }
    Write-Host ''
    Write-Host "Planned release: $($script:ReleaseId)"
    Write-Host "Apply gate: `$env:KEEPINTAX_PRODUCTION_DEPLOY='$Project'"
    return
  }

  # Install exactly the locked backend dependencies, run the full Jest suite,
  # and prove the Nest production bundle compiles before touching the cloud.
  Invoke-Stage 'Backend dependencies, tests, and production build' {
    Push-Location $backendDirectory
    try {
      Invoke-Native $script:NpmCommand @('ci')
      Invoke-Native $script:NpmCommand @('test', '--', '--runInBand')
      Invoke-Native $script:NpmCommand @('run', 'build')
    } finally { Pop-Location }
  }

  # Build the Angular production output that will later be uploaded to a
  # preview channel and, only after browser verification, cloned to live.
  Invoke-Stage 'Frontend dependencies and production build' {
    Push-Location $frontendDirectory
    try {
      Invoke-Native $script:NpmCommand @('ci')
      Invoke-Native $script:NpmCommand @('run', 'build', '--', '--configuration', 'production')
      if (!(Test-Path -LiteralPath (Join-Path $frontendDirectory 'dist/app/index.html'))) {
        throw 'Frontend production build did not create dist/app/index.html'
      }
    } finally { Pop-Location }
  }

  # Validate the external Playwright package and its guarded configuration.
  # Browser tests against production do not run yet.
  Invoke-Stage 'Smoke dependencies and local configuration tests' {
    Push-Location $smokeDirectory
    try {
      Invoke-Native $script:NpmCommand @('ci')
      Invoke-Native $script:NpmCommand @('test')
    } finally { Pop-Location }
  }

  # Package backend source from the verified Git commit, never from mutable
  # working-tree files. Secrets, dependencies, and build output are excluded.
  Invoke-Stage 'Create clean backend source snapshot' {
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
  }

  # Build/deploy a new immutable Cloud Run revision with a direct tag URL but
  # keep all public production traffic on the previously serving revision.
  Invoke-Stage 'Deploy backend candidate with zero traffic' {
    $source = Join-Path $script:ReleaseDirectory 'backend-source'
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
    $expectedRevision = "$BackendService-$($script:ReleaseId)"
    if ($script:CandidateRevision -ne $expectedRevision) {
      throw "Unexpected candidate revision: $($script:CandidateRevision)"
    }
    $candidateTraffic = @($candidateState.status.traffic | Where-Object { $_.tag -eq $script:ReleaseId })
    $script:CandidateUrl = [string]$candidateTraffic[0].url
    $script:CandidateImage = [string]@($candidateState.spec.template.spec.containers)[0].image
    if (!$script:CandidateUrl.StartsWith('https://')) { throw 'Tagged candidate URL is missing' }
    if ($script:CandidateImage -notmatch '^.+@sha256:[0-9a-f]{64}$') {
      throw 'Candidate image is not an immutable sha256 reference'
    }
    $activeTraffic = @($candidateState.status.traffic | Where-Object { $_.percent -gt 0 })
    if ($activeTraffic.Count -ne 1 -or
        $activeTraffic[0].percent -ne 100 -or
        $activeTraffic[0].revisionName -ne $script:OldBackendRevision) {
      $script:BackendPromoted = $true
      throw 'The zero-traffic deployment unexpectedly changed production traffic'
    }
    Write-ReleaseStatus 'INFO' "Candidate revision: $($script:CandidateRevision)" DarkGray
    Write-ReleaseStatus 'INFO' "Candidate URL: $($script:CandidateUrl)" DarkGray
  }

  # Call /ready on the candidate tag URL. This checks the candidate's actual
  # production DB connection and signup-critical schema before promotion.
  Invoke-Stage 'Candidate backend readiness' {
    & $candidateReadinessScript -ApiUrl $script:CandidateUrl -BrowserChannel $BrowserChannel
    if ($LASTEXITCODE -ne 0) { throw "Candidate readiness exited with code $LASTEXITCODE" }
  }

  # Create/update the private Firebase verification and cleanup jobs from the
  # exact candidate image digest. Neither job is executed in this stage.
  Invoke-Stage 'Configure private smoke jobs from candidate image' {
    $previousGate = $env:SMOKE_CONFIGURE_JOBS
    try {
      $env:SMOKE_CONFIGURE_JOBS = $Project
      & $configureJobsScript -Project $Project -Region $Region -SourceService $BackendService -Image $script:CandidateImage -Apply
      if ($LASTEXITCODE -ne 0) { throw "Smoke job configuration exited with code $LASTEXITCODE" }
    } finally {
      $env:SMOKE_CONFIGURE_JOBS = $previousGate
    }
  }

  # Move traffic to the explicit candidate revision, then read Cloud Run state
  # back and verify that it alone receives 100% (never promote LATEST).
  Invoke-Stage 'Promote exact backend revision to 100% traffic' {
    Invoke-Native $script:GcloudCommand @(
      'run', 'services', 'update-traffic', $BackendService,
      "--to-revisions=$($script:CandidateRevision)=100",
      "--project=$Project",
      "--region=$Region",
      '--quiet'
    )
    $script:BackendPromoted = $true
    Assert-BackendTraffic $script:CandidateRevision
  }

  # Upload the already-built frontend to an expiring preview channel. Live
  # users still receive the old Firebase Hosting version at this point.
  Invoke-Stage 'Deploy Firebase frontend preview' {
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
  }

  # Open the preview with Playwright and verify registration UI/API wiring
  # without creating a user or modifying production application data.
  Invoke-Stage 'Read-only browser smoke against frontend preview' {
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
  }

  # Preserve the exact currently-live Hosting version in a fixed rollback
  # channel immediately before changing the live frontend.
  Invoke-Stage 'Back up current Firebase live release' {
    Invoke-Native $script:FirebaseCommand @(
      'hosting:clone', "${HostingSite}:live", "${HostingSite}:$($script:BackupChannel)",
      "--project=$Project",
      '--non-interactive'
    )
    $script:FrontendBackupCreated = $true
  }

  # Promote by cloning the exact preview version that passed browser smoke;
  # do not rebuild or upload a different set of frontend files.
  Invoke-Stage 'Promote tested Firebase preview to live' {
    $script:FrontendDeploymentStarted = $true
    Invoke-Native $script:FirebaseCommand @(
      'hosting:clone', "${HostingSite}:$($script:ReleaseId)", "${HostingSite}:live",
      "--project=$Project",
      '--non-interactive'
    )
  }

  # Exercise the real public flow: readiness, UI, signup, private verification,
  # login/dashboard, and guaranteed private cleanup.
  Invoke-Stage 'Full production signup, login, and cleanup smoke' {
    $previousGate = $env:SMOKE_RUN_PRODUCTION
    try {
      $env:SMOKE_RUN_PRODUCTION = 'app.keepintax.co.il'
      & $productionSmokeScript -ApiUrl $PublicApiUrl -BrowserChannel $BrowserChannel
      if ($LASTEXITCODE -ne 0) { throw "Production smoke exited with code $LASTEXITCODE" }
    } finally {
      $env:SMOKE_RUN_PRODUCTION = $previousGate
    }
  }

  Write-Host ''
  Write-ReleaseStatus 'SUCCESS' "Production release $($script:ReleaseId) completed" Green
  $script:StageResults | Format-Table -AutoSize
} catch {
  $originalError = $_.Exception.Message
  $failedStage = $script:CurrentStage

  if ($Apply -and $script:CandidateRevision -and !$script:BackendPromoted) {
    Write-ReleaseStatus 'SAFE' "Candidate $($script:CandidateRevision) was not promoted; existing production traffic remains unchanged" Yellow
  }

  # If live Hosting may have changed, restore the version saved immediately
  # before promotion. Report rollback failure separately from the root cause.
  if ($Apply -and $script:FrontendDeploymentStarted -and $script:FrontendBackupCreated) {
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
  if ($Apply -and $script:BackendPromoted -and $script:OldBackendRevision) {
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
  exit 1
} finally {
  Set-Location $repositoryRoot
  try { Remove-ReleaseDirectory } catch {
    Write-ReleaseStatus 'WARNING' "Temporary release cleanup failed: $($_.Exception.Message)" Yellow
  }
}
