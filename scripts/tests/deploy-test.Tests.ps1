$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$scriptPath = Join-Path $PSScriptRoot '../deploy-test.ps1'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "Parse errors: $parseErrors" }
foreach ($definition in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
  . ([scriptblock]::Create($definition.Extent.Text))
}
$script:checks = 0
function Assert([bool]$Condition, [string]$Message) {
  if (!$Condition) { throw "FAIL: $Message" }
  $script:checks++
}
$full = @(Get-TestDeploymentPlan Full $false)
$backend = @(Get-TestDeploymentPlan Backend $false)
$frontend = @(Get-TestDeploymentPlan Frontend $false)
Assert ($full.Count -eq 9) 'Full plan includes preflights, installs, tests, builds and deployments'
Assert ($backend.Count -eq 5) 'Backend plan selects only backend stages'
Assert ($frontend.Count -eq 4) 'Frontend plan selects only frontend stages'
Assert (@($full | Where-Object { $_.stage -eq 'Test backend' }).Count -eq 1) 'Jest required by default'
$skipped = @(Get-TestDeploymentPlan Full $true)
Assert (@($skipped | Where-Object { $_.stage -eq 'Test backend' }).Count -eq 0) 'SkipLocalTests removes Jest'
Assert (@($skipped | Where-Object { $_.stage -like 'Build *' }).Count -eq 2) 'SkipLocalTests retains both builds'
Assert (@($frontend | Where-Object tool -eq gcloud).Count -eq 0) 'Frontend has no backend cloud calls'
Assert (@($backend | Where-Object tool -eq firebase).Count -eq 0) 'Backend has no Firebase calls'
$cloud = $full | Where-Object stage -eq 'Deploy test backend'
Assert ($cloud.arguments -contains 'taxmys16elf-dev') 'Backend service fixed to DEV'
Assert ($cloud.arguments -contains '--project=taxmyself-prod') 'Existing DEV service project explicit'
$hosting = $full | Where-Object stage -eq 'Deploy test frontend'
Assert ($hosting.arguments -contains '--project=taxmyself-5d8a0') 'Firebase project fixed to DEV'
Assert ($hosting.arguments -contains '--only=hosting:app') 'Landing site excluded'
Assert (($full | Where-Object stage -eq 'Build test frontend').arguments -contains 'build:dev') 'Frontend uses cloud DEV environment'

# Exercise the native command adapter as well as mocked cloud orchestration.
$nativeDefinition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-TestCommand' }, $true)
. ([scriptblock]::Create($nativeDefinition.Extent.Text.Replace('function Invoke-TestCommand(', 'function Invoke-RealTestCommand(')))
$shellCommand = (Get-Process -Id $PID).Path
$beforeLocation = (Get-Location).Path
$nativeProbe = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('[Console]::Error.WriteLine("native diagnostic"); Write-Output "native success"; exit 0'))
$nativeResult = Invoke-RealTestCommand $shellCommand @('-NoProfile', '-EncodedCommand', $nativeProbe) $PSScriptRoot | Out-String
Assert ($nativeResult -match 'native success') 'Native stderr does not turn exit zero into failure'
Assert ((Get-Location).Path -eq $beforeLocation) 'Native command restores working directory'
try {
  Invoke-RealTestCommand $shellCommand @('-NoProfile', '-Command', 'exit 7') $PSScriptRoot
  throw 'Expected native nonzero failure'
} catch { Assert ($_.Exception.Message -like '*exited with code 7*') 'Native nonzero exit fails with code' }
Assert ((Get-Location).Path -eq $beforeLocation) 'Native failure restores working directory'

# Exercise the production orchestration function with deterministic fake CLI output.
$script:calls = [Collections.Generic.List[object]]::new()
$script:failure = ''
$script:dirty = $false
$script:changed = $false
$script:moveRemoteDuringBuild = $false; $script:branch = 'test'; $script:remoteCommit = 'a' * 40; $script:headReads = 0
$script:sourcePath = $null
function Invoke-TestCommand([string]$Tool, [string[]]$Arguments, [string]$Directory) {
  $script:calls.Add([pscustomobject]@{ tool = $Tool; arguments = $Arguments; directory = $Directory })
  if ($Tool -eq 'git') {
    switch ($Arguments[0]) {
      'status' { if ($script:dirty) { ' M changed-file' }; return }
      'symbolic-ref' { return $script:branch }
      'rev-parse' {
        if ($Arguments[1] -eq 'refs/remotes/origin/test') { return $script:remoteCommit }
        $script:headReads++
        if ($script:changed -and $script:headReads -gt 1) { 'b' * 40 } else { 'a' * 40 }; return
      }
      'archive' {
        $output = $Arguments[2].Substring('--output='.Length)
        $inputPath = Join-Path (Split-Path $output) 'Dockerfile'
        'FROM scratch' | Set-Content -LiteralPath $inputPath
        Compress-Archive -LiteralPath $inputPath -DestinationPath $output
        return
      }
    }
  }
  if ($script:moveRemoteDuringBuild -and $Tool -eq 'npm' -and $Arguments -contains 'build:dev') { $script:remoteCommit = 'c' * 40 }
  if ($Tool -eq 'gcloud' -and $Arguments[1] -eq 'deploy') {
    $script:sourcePath = ($Arguments | Where-Object { $_ -like '--source=*' }).Substring('--source='.Length)
    Assert (Test-Path -LiteralPath (Join-Path $script:sourcePath 'Dockerfile')) 'Deploy uses extracted Git archive'
    $ignore = Get-Content -LiteralPath (Join-Path $script:sourcePath '.gcloudignore')
    Assert ($ignore -contains '.env' -and $ignore -contains '.env.*') 'Cloud upload excludes local env files'
  }
  if (($Tool + ' ' + ($Arguments -join ' ')) -like $script:failure -and $script:failure) { throw 'simulated CLI failure' }
}
function Reset-Mocks {
  $script:calls.Clear(); $script:failure = ''; $script:dirty = $false
  $script:changed = $false; $script:moveRemoteDuringBuild = $false; $script:branch = 'test'; $script:remoteCommit = 'a' * 40; $script:headReads = 0; $script:sourcePath = $null
}
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Invoke-TestDeployment $root $full
$sequence = @($script:calls | ForEach-Object { $_.tool + ' ' + ($_.arguments -join ' ') })
$buildIndex = [array]::IndexOf($sequence, 'npm run build:dev')
$deployIndex = -1
for ($index = 0; $index -lt $sequence.Count; $index++) { if ($sequence[$index] -like 'gcloud run deploy *') { $deployIndex = $index; break } }
Assert ($buildIndex -lt $deployIndex) 'Both builds finish before first deployment'
Assert (!(Test-Path -LiteralPath $script:sourcePath)) 'Temporary backend snapshot cleaned after success'

Reset-Mocks; $script:dirty = $true
try { Invoke-TestDeployment $root $full; throw 'Expected dirty checkout failure' } catch {
  Assert ($_.Exception.Message -like '*Verify clean Git checkout*') 'Dirty checkout reports stage'
}
Assert ($script:calls.Count -eq 1) 'Dirty checkout stops before cloud access'

Reset-Mocks; $script:failure = 'npm test*'
try { Invoke-TestDeployment $root $full; throw 'Expected Jest failure' } catch {
  Assert ($_.Exception.Message -like '*Test backend*simulated CLI failure*') 'Test failure reports original stage/reason'
}
Assert (@($script:calls | Where-Object { $_.arguments -contains 'deploy' }).Count -eq 0) 'Failed local tests prevent deployments'

Reset-Mocks; $script:failure = 'gcloud run services describe*'
try { Invoke-TestDeployment $root $full; throw 'Expected preflight failure' } catch {
  Assert ($_.Exception.Message -like '*Check existing test backend*') 'Preflight failure reports stage'
}
Assert (@($script:calls | Where-Object tool -eq npm).Count -eq 0) 'Missing backend/access stops before installs'

Reset-Mocks; $script:changed = $true
try { Invoke-TestDeployment $root $frontend; throw 'Expected revision change failure' } catch {
  Assert ($_.Exception.Message -like '*Checkout changed*') 'Changing HEAD stops deployment'
}
Assert (@($script:calls | Where-Object { $_.arguments -contains 'deploy' }).Count -eq 0) 'Changed revision never deployed'

Reset-Mocks; $script:failure = 'gcloud run deploy*'
try { Invoke-TestDeployment $root $full; throw 'Expected deploy failure' } catch {
  Assert ($_.Exception.Message -like '*Deploy test backend*simulated CLI failure*') 'Cloud failure reports stage/reason'
}
Assert (@($script:calls | Where-Object { $_.tool -eq 'firebase' -and $_.arguments -contains 'deploy' }).Count -eq 0) 'Backend failure stops frontend deployment'
Assert (!(Test-Path -LiteralPath $script:sourcePath)) 'Temporary snapshot cleaned after cloud failure'

# Reject other branches, detached HEAD, any local/remote mismatch, and fetch errors.
foreach ($invalidBranch in @('main', 'codex/feature', '')) {
  Reset-Mocks; $script:branch = $invalidBranch
  try { Invoke-TestDeployment $root $full; throw 'Expected branch rejection' } catch {
    Assert ($_.Exception.Message -like '*requires branch test*') 'Only dedicated test branch accepted'
  }
  Assert (@($script:calls | Where-Object tool -ne git).Count -eq 0) 'Wrong branch stops before cloud/install calls'
}
Reset-Mocks; $script:remoteCommit = 'c' * 40
try { Invoke-TestDeployment $root $full; throw 'Expected remote mismatch rejection' } catch {
  Assert ($_.Exception.Message -like '*exactly match origin/test*') 'Nonidentical remote commit rejected'
}
Assert (@($script:calls | Where-Object tool -ne git).Count -eq 0) 'Remote mismatch stops before cloud/install calls'
Reset-Mocks; $script:failure = 'git fetch*'
try { Invoke-TestDeployment $root $full; throw 'Expected fetch failure' } catch {
  Assert ($_.Exception.Message -like '*simulated CLI failure*') 'Failed fetch or missing origin/test blocks deployment'
}
Assert (@($script:calls | Where-Object tool -ne git).Count -eq 0) 'Fetch failure stops before cloud/install calls'
Reset-Mocks
Invoke-TestDeployment $root $full
Assert (@($script:calls | Where-Object { $_.tool -eq 'git' -and $_.arguments[0] -eq 'fetch' }).Count -eq 3) 'Remote refreshed initially and before each deployment'
Reset-Mocks; $script:moveRemoteDuringBuild = $true
try { Invoke-TestDeployment $root $frontend; throw 'Expected changed remote rejection' } catch {
  Assert ($_.Exception.Message -like '*Deploy test frontend*exactly match origin/test*') 'Remote change during build blocks deployment'
}
Assert (@($script:calls | Where-Object { $_.arguments -contains 'deploy' }).Count -eq 0) 'Changed remote is never deployed'
# Public entrypoints must bypass execution entirely, even in this dirty checkout.
$planOutput = & $scriptPath frontend -Plan | ConvertFrom-Json
Assert (@($planOutput).Count -eq 4) 'Public Plan returns frontend-only JSON'
$helpOutput = & $scriptPath -Help | Out-String
Assert ($helpOutput -match 'Usage:') 'Help works without CLI execution'
Assert ($script:calls.Count -gt 0) 'Mocked orchestration actually ran'
Write-Host "PASS: $script:checks checks; no real cloud calls or dependency installation."
