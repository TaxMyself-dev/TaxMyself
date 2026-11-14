<#
.SYNOPSIS
Deploy the committed application to the existing shared DEV/test environment.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('Full', 'Backend', 'Frontend')]
  [string]$Target = 'Full',
  [switch]$SkipLocalTests,
  [switch]$Plan,
  [Alias('h')][switch]$Help
)

if ($Help) {
  @"
KeepInTax shared test deployment
Usage: .\scripts\deploy-test [full|backend|frontend] [-SkipLocalTests] [-Plan]

Default: full. Deploy only from clean branch test, exactly matching origin/test.
Backend: taxmyself-prod / me-west1 / taxmys16elf-dev (existing runtime settings).
Frontend: taxmyself-5d8a0 / hosting:app, built with build:dev.
This replaces the shared test environment for everyone using it.
-SkipLocalTests skips backend Jest only; builds remain required.
-Plan prints the command plan without Git, login, builds or cloud access.
-Help, -h prints this help without side effects.
Requires existing authenticated gcloud and Firebase CLI sessions as applicable.
No production deployment, schema scripts, smoke jobs or landing deployment.
A partial failure stops immediately; there is no automatic test rollback.
"@ | Write-Output
  return
}

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-TestDeploymentPlan([string]$DeploymentTarget, [bool]$SkipTests) {
  if ($DeploymentTarget -ne 'Frontend') {
    [pscustomobject]@{ stage = 'Check existing test backend'; directory = '.'; tool = 'gcloud'; arguments = @('run', 'services', 'describe', 'taxmys16elf-dev', '--project=taxmyself-prod', '--region=me-west1', '--format=value(metadata.name)') }
  }
  if ($DeploymentTarget -ne 'Backend') {
    [pscustomobject]@{ stage = 'Check test Hosting access'; directory = '.'; tool = 'firebase'; arguments = @('hosting:sites:list', '--project=taxmyself-5d8a0', '--non-interactive') }
  }
  if ($DeploymentTarget -ne 'Frontend') {
    [pscustomobject]@{ stage = 'Install backend dependencies'; directory = 'backend'; tool = 'npm'; arguments = @('ci') }
    if (!$SkipTests) {
      [pscustomobject]@{ stage = 'Test backend'; directory = 'backend'; tool = 'npm'; arguments = @('test', '--', '--runInBand') }
    }
    [pscustomobject]@{ stage = 'Build backend'; directory = 'backend'; tool = 'npm'; arguments = @('run', 'build') }
  }
  if ($DeploymentTarget -ne 'Backend') {
    [pscustomobject]@{ stage = 'Install frontend dependencies'; directory = 'frontend'; tool = 'npm'; arguments = @('ci') }
    [pscustomobject]@{ stage = 'Build test frontend'; directory = 'frontend'; tool = 'npm'; arguments = @('run', 'build:dev') }
  }
  if ($DeploymentTarget -ne 'Frontend') {
    [pscustomobject]@{ stage = 'Deploy test backend'; directory = '.'; tool = 'gcloud'; arguments = @('run', 'deploy', 'taxmys16elf-dev', '--source=<clean-backend-snapshot>', '--project=taxmyself-prod', '--region=me-west1', '--quiet') }
  }
  if ($DeploymentTarget -ne 'Backend') {
    [pscustomobject]@{ stage = 'Deploy test frontend'; directory = '.'; tool = 'firebase'; arguments = @('deploy', '--project=taxmyself-5d8a0', '--only=hosting:app', '--config=firebase.json', '--non-interactive') }
  }
}

function Invoke-TestCommand([string]$Tool, [string[]]$Arguments, [string]$Directory) {
  $commandName = if ($IsWindows -and $Tool -in @('npm', 'firebase')) { "$Tool.cmd" } else { $Tool }
  $command = Get-Command $commandName -CommandType Application -ErrorAction Stop | Select-Object -First 1
  Push-Location -LiteralPath $Directory
  try {
    # Native stderr is diagnostic output; only the native exit code indicates failure.
    $PSNativeCommandUseErrorActionPreference = $false
    & $command.Source @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Tool exited with code $LASTEXITCODE" }
  } finally { Pop-Location }
}

function Assert-TestDeploymentCheckout([string]$Root, [string]$ExpectedCommit = '') {
  $dirty = @(Invoke-TestCommand 'git' @('status', '--porcelain', '--untracked-files=normal') $Root)
  if ($dirty.Count) { throw 'Commit or remove local changes before deploying.' }
  $branch = (Invoke-TestCommand 'git' @('symbolic-ref', '--quiet', '--short', 'HEAD') $Root | Out-String).Trim()
  if ($branch -ne 'test') { throw 'Test deployment requires branch test.' }
  # Fetch the exact remote branch every time: a stale tracking ref is insufficient.
  # Failure (including a missing remote branch) must block all cloud writes.
  Invoke-TestCommand 'git' @('fetch', '--no-tags', 'origin', '+refs/heads/test:refs/remotes/origin/test') $Root | Out-Host
  $commit = (Invoke-TestCommand 'git' @('rev-parse', 'HEAD') $Root | Out-String).Trim()
  $remoteCommit = (Invoke-TestCommand 'git' @('rev-parse', 'refs/remotes/origin/test') $Root | Out-String).Trim()
  if ($commit -notmatch '^[a-f0-9]{40}$' -or $remoteCommit -notmatch '^[a-f0-9]{40}$') { throw 'Cannot determine local/remote test commit.' }
  if ($ExpectedCommit -and $commit -ne $ExpectedCommit) { throw 'Checkout changed during verification; refusing deployment.' }
  if ($commit -ne $remoteCommit) { throw 'Branch test must exactly match origin/test; ahead, behind or diverged commits cannot be deployed.' }
  return $commit
}
function Invoke-TestDeployment([string]$Root, [object[]]$Steps) {
  $snapshot = $null
  $stage = 'Verify clean Git checkout'
  try {
    $commit = Assert-TestDeploymentCheckout $Root
    Write-Host "Deploying commit $commit to the shared test environment."
    foreach ($step in $Steps) {
      $stage = $step.stage
      Write-Host "[START] $stage"
      $arguments = @($step.arguments)
      if ($stage -eq 'Deploy test backend') {
        $snapshot = Join-Path ([IO.Path]::GetTempPath()) ('keepintax-test-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $snapshot | Out-Null
        $archive = Join-Path $snapshot 'backend.zip'
        $source = Join-Path $snapshot 'source'
        Invoke-TestCommand 'git' @('archive', '--format=zip', "--output=$archive", "${commit}:backend") $Root
        Expand-Archive -LiteralPath $archive -DestinationPath $source
        @('.git', 'node_modules', 'dist', '.env', '.env.*', '*.key', '*.pem') |
          Set-Content -LiteralPath (Join-Path $source '.gcloudignore') -Encoding ascii
        $arguments = @($arguments | ForEach-Object { if ($_ -eq '--source=<clean-backend-snapshot>') { "--source=$source" } else { $_ } })
      }
      if ($stage -like 'Deploy test *') {
        $null = Assert-TestDeploymentCheckout $Root $commit
      }
      Invoke-TestCommand $step.tool $arguments (Join-Path $Root $step.directory)
      Write-Host "[COMPLETE] $stage"
    }
    Write-Host 'Test deployment completed. Verify the application manually at https://taxmyself-5d8a0.web.app'
  } catch {
    throw "Test deployment FAILED at ${stage}: $($_.Exception.Message). Completed stages are not rolled back."
  } finally {
    if ($snapshot -and (Test-Path -LiteralPath $snapshot)) {
      # Only delete the exact unique directory this invocation created under OS temp.
      $resolvedSnapshot = (Resolve-Path -LiteralPath $snapshot).Path
      $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
      if ((Split-Path $resolvedSnapshot -Parent) -ne $tempRoot -or (Split-Path $resolvedSnapshot -Leaf) -notmatch '^keepintax-test-[a-f0-9]{32}$') {
        throw 'Refusing to remove a snapshot outside the expected temporary directory.'
      }
      Remove-Item -LiteralPath $resolvedSnapshot -Recurse -Force
    }
  }
}

$steps = @(Get-TestDeploymentPlan $Target ([bool]$SkipLocalTests))
if ($Plan) { $steps | ConvertTo-Json -Depth 5; return }
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Invoke-TestDeployment $root $steps
