$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $repo 'scripts/deploy-build-cache.ps1')
function Assert-CacheTest([bool]$Condition, [string]$Message) { if (!$Condition) { throw $Message } }
function Write-ReleaseLog { param($Record) }
function Write-ReleaseStatus { param($State, $Message, $Color) }
function Get-CommandName { param($Name) return "$Name-stub" }
$script:mockCommit = 'commit-a'
$script:mockNode = 'v24.13.0'
$script:remoteAvailable = $true
$script:failCommand = ''
$script:calls = [System.Collections.Generic.List[object]]::new()
$digest = 'sha256:' + ('a' * 64)
$image = "me-west1-docker.pkg.dev/test/cloud-run-source-deploy/backend@$digest"
function Invoke-NativeCapture {
  param($Command, $Arguments)
  if ($Command -eq 'git-stub') {
    if ($Arguments[0] -eq 'rev-parse') { return $script:mockCommit }
    if ($Arguments[0] -eq 'status') { return '' }
  }
  if ($Command -eq 'node-stub') { return $script:mockNode }
  if ($Command -eq 'npm-stub') { return '11.0.0' }
  if ($Arguments[0] -eq 'artifacts') {
    if (!$script:remoteAvailable) { throw 'Image deleted or access denied' }
    return $digest
  }
  if ($Arguments[0] -eq 'run' -and $Arguments[2] -eq 'describe') {
    return (@{
      status = @{ latestCreatedRevisionName = "backend-$($script:ReleaseId)"; latestReadyRevisionName = "backend-$($script:ReleaseId)"
        traffic = @(@{ revisionName = 'old'; percent = 100 }, @{ revisionName = "backend-$($script:ReleaseId)"; tag = $script:ReleaseId; url = 'https://candidate.example'; percent = 0 }) }
      spec = @{ template = @{ spec = @{ containers = @(@{ image = $image }) } } }
    } | ConvertTo-Json -Depth 10)
  }
  throw 'Unexpected capture command'
}
function Invoke-Native {
  param($Command, $Arguments)
  $script:calls.Add(@($Arguments))
  if ($Arguments[0] -eq $script:failCommand) { throw 'Simulated command failure' }
  if ($Command -eq 'npm-stub' -and $Arguments[0] -eq 'run') {
    if ((Get-Location).Path -eq $backendDirectory) { Set-Content -LiteralPath (Join-Path $backendDirectory 'dist/main.js') 'compiled backend' }
    else { Set-Content -LiteralPath (Join-Path $frontendDirectory 'dist/app/index.html') 'compiled frontend' }
  }
}
function Get-TrafficPercent { param($Traffic) return [int]$Traffic.percent }
function Get-OptionalProperty { param($Object, $Name) if ($Object.PSObject.Properties[$Name]) { return $Object.$Name } }
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'scripts/deploy.ps1'), [ref]$null, [ref]$null)
function Get-BuildStage([string]$Name) {
  $node = $ast.Find({ param($n)
    $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Invoke-Stage' -and
      $n.CommandElements[1].Value -eq $Name
  }, $true)
  if (!$node) { throw "Missing stage $Name" }
  return $node.CommandElements[-1].ScriptBlock.GetScriptBlock()
}
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('deploy-cache-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  $repositoryRoot = $tempRoot
  $backendDirectory = Join-Path $tempRoot 'backend'
  $frontendDirectory = Join-Path $tempRoot 'frontend'
  $backendOutput = Join-Path $backendDirectory 'dist'
  $frontendOutput = Join-Path $frontendDirectory 'dist/app'
  New-Item -ItemType Directory -Path $backendOutput, $frontendOutput | Out-Null
  $script:BuildCacheDirectory = Join-Path $tempRoot 'cache'
  $script:GitCommand = 'git-stub'
  $script:NpmCommand = 'npm-stub'
  $script:GcloudCommand = 'gcloud-stub'
  $Project = 'test'; $Region = 'me-west1'; $BackendService = 'backend'; $HostingSite = 'site'; $PublicApiUrl = 'https://api.example'
  $SkipLocalTests = $false; $Rebuild = $false
  $script:BuildCacheKey = Get-BuildInputKey
  $originalKey = $script:BuildCacheKey
  Assert-CacheTest (!(Test-CachedBuild 'backend' $backendOutput)) 'Unrecorded artifacts must not be reused'
  $backendStage = Get-BuildStage 'Backend dependencies, tests, and production build'
  & $backendStage
  Assert-CacheTest ($script:calls.Count -eq 3) 'First backend attempt must install, test and build'
  $script:calls.Clear()
  & $backendStage
  Assert-CacheTest ($script:calls.Count -eq 0) 'A completed backend stage must not rebuild on retry'
  $frontendStage = Get-BuildStage 'Frontend dependencies and production build'
  & $frontendStage
  Assert-CacheTest ($script:calls.Count -eq 2) 'Frontend must build independently'
  $script:calls.Clear()
  & $frontendStage
  Assert-CacheTest ($script:calls.Count -eq 0) 'Completed frontend output must be reused'
  Set-Content -LiteralPath (Join-Path $frontendOutput 'index.html') 'changed'
  Assert-CacheTest (!(Test-CachedBuild 'frontend' $frontendOutput)) 'Modified frontend must invalidate reuse'
  & $frontendStage
  Remove-Item -LiteralPath (Join-Path $frontendOutput 'index.html')
  Assert-CacheTest (!(Test-CachedBuild 'frontend' $frontendOutput)) 'Missing frontend output must invalidate reuse'
  $script:mockCommit = 'commit-b'
  Assert-CacheTest ((Get-BuildInputKey) -ne $originalKey) 'A different commit must invalidate reuse'
  $script:mockCommit = 'commit-a'
  $script:mockNode = 'v22.0.0'
  Assert-CacheTest ((Get-BuildInputKey) -ne $originalKey) 'A different runtime must invalidate reuse'
  $script:mockNode = 'v24.13.0'
  $SkipLocalTests = $true
  Assert-CacheTest ((Get-BuildInputKey) -ne $originalKey) 'Skipped tests must not satisfy a normal deployment'
  $SkipLocalTests = $false
  Set-Content -LiteralPath (Join-Path $backendDirectory '.env') 'TEST_SECRET=not-a-real-secret'
  Assert-CacheTest ((Get-BuildInputKey) -ne $originalKey) 'Local environment file changes must invalidate reuse'
  Remove-Item -LiteralPath (Join-Path $backendDirectory '.env')
  $Project = 'other'
  Assert-CacheTest ((Get-BuildInputKey) -ne $originalKey) 'Deployment context changes must invalidate reuse'
  $Project = 'test'
  Write-BuildCache 'image' @{ image = $image }
  Assert-CacheTest ((Get-ReusableBackendImage) -eq $image) 'Available immutable image must be reusable'
  $script:remoteAvailable = $false
  Assert-CacheTest ($null -eq (Get-ReusableBackendImage)) 'Unavailable image must fall back to a source build'
  $script:remoteAvailable = $true
  $script:ReleaseDirectory = $null
  & (Get-BuildStage 'Create clean backend source snapshot')
  Assert-CacheTest ($null -eq $script:ReleaseDirectory) 'An available image must skip source packaging'
  Assert-CacheTest ($script:ReusableBackendImage -eq $image) 'Source stage must select the verified image'
  $Rebuild = $true
  Assert-CacheTest (!(Test-CachedBuild 'backend' $backendOutput)) 'Rebuild must bypass local output cache'
  Assert-CacheTest ($null -eq (Get-ReusableBackendImage)) 'Rebuild must bypass remote image cache'
  $Rebuild = $false
  $script:ReleaseId = 'r20261104-150000-0013'
  $script:OldBackendRevision = 'old'; $script:BackendPromoted = $false
  $script:ReusableBackendImage = $image
  $script:calls.Clear()
  & (Get-BuildStage 'Deploy backend candidate with zero traffic')
  $deployment = $script:calls[0]
  Assert-CacheTest ($deployment -contains "--image=$image") 'Retry must deploy the exact cached digest'
  Assert-CacheTest ($deployment -contains '--no-traffic') 'Image reuse must retain zero-traffic protection'
  Assert-CacheTest (!@($deployment | Where-Object { $_ -like '--source=*' }).Count) 'Image reuse must not trigger a source build'
  $script:ReusableBackendImage = $null
  $script:ReleaseDirectory = $tempRoot
  $script:calls.Clear()
  & (Get-BuildStage 'Deploy backend candidate with zero traffic')
  Assert-CacheTest (@($script:calls[0] | Where-Object { $_ -like '--source=*' }).Count -eq 1) 'Unavailable image must use clean source deployment'
  # A failed new build cannot leave a reusable build or image success record.
  $script:failCommand = 'test'
  Set-Content -LiteralPath (Join-Path $backendOutput 'main.js') 'modified'
  $failed = $false
  try { & $backendStage } catch { $failed = $true }
  Assert-CacheTest $failed 'Failed backend tests must abort the stage'
  Assert-CacheTest ($null -eq (Read-BuildCache 'backend')) 'Failed backend stage must not be cached as complete'
  Assert-CacheTest ($null -eq (Read-BuildCache 'image')) 'Failed backend rebuild must invalidate its old image'
  $script:failCommand = 'run'
  $failed = $false
  try { & $frontendStage } catch { $failed = $true }
  Assert-CacheTest $failed 'A failed frontend build must abort the stage'
  Assert-CacheTest ($null -eq (Read-BuildCache 'frontend')) 'Failed frontend stage must not be cached as complete'
  Set-Content -LiteralPath (Join-Path $script:BuildCacheDirectory 'frontend.json') '{broken'
  Assert-CacheTest ($null -eq (Read-BuildCache 'frontend')) 'Corrupt manifests must rebuild safely'
  Write-Output 'build reuse tests passed'
} finally {
  # Delete only the exact, newly-created test directory under the system temp root.
  $resolved = [IO.Path]::GetFullPath($tempRoot)
  $allowed = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (!$resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'deploy-cache-test-*') {
    throw 'Refusing unsafe test cleanup'
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
