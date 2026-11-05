# Local, disposable evidence of completed builds. Never infer success from a log
# or from an unrecorded dist folder. Cache data contains hashes, not environment values.
function Get-BuildTextHash([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Get-BuildInputKey {
  $commit = (Invoke-NativeCapture $script:GitCommand @('rev-parse', 'HEAD')).Trim()
  $nodeVersion = (Invoke-NativeCapture (Get-CommandName 'node') @('--version')).Trim()
  $npmVersion = (Invoke-NativeCapture $script:NpmCommand @('--version')).Trim()
  $environment = @(Get-ChildItem Env: | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join "`n"
  $localConfig = foreach ($directory in @($repositoryRoot, $backendDirectory, $frontendDirectory)) {
    foreach ($file in @(Get-ChildItem -LiteralPath $directory -File -Force | Where-Object { $_.Name -like '.env*' -or $_.Name -eq '.npmrc' } | Sort-Object Name)) {
      "$($file.FullName):$((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash)"
    }
  }
  return Get-BuildTextHash (@('v1', $commit, $nodeVersion, $npmVersion, $Project, $Region, $BackendService,
    $HostingSite, $PublicApiUrl, [string][bool]$SkipLocalTests, $environment, ($localConfig -join "`n")) -join "`n")
}

function Get-BuildTreeHash([string]$Directory) {
  if (!(Test-Path -LiteralPath $Directory -PathType Container)) { return $null }
  $root = Get-Item -LiteralPath $Directory
  if ($root.Attributes -band [IO.FileAttributes]::ReparsePoint) { return $null }
  $entries = @(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
  if (@($entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { return $null }
  $files = @($entries | Where-Object { !$_.PSIsContainer } | Sort-Object FullName)
  if (!$files.Count) { return $null }
  $rows = foreach ($file in $files) {
    "$($file.FullName.Substring($root.FullName.Length)):$((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash)"
  }
  return Get-BuildTextHash ($rows -join "`n")
}

function Read-BuildCache([string]$Kind) {
  if ($Rebuild -or !$script:BuildCacheKey) { return $null }
  try {
    $path = Join-Path $script:BuildCacheDirectory "$Kind.json"
    if (!(Test-Path -LiteralPath $path)) { return $null }
    $record = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($record.key -ne $script:BuildCacheKey) { return $null }
    return $record
  } catch {
    Write-ReleaseLog "Ignoring unreadable $Kind build cache"
    return $null
  }
}

function Write-BuildCache([string]$Kind, [hashtable]$Values) {
  try {
    $Values.key = $script:BuildCacheKey
    New-Item -ItemType Directory -Path $script:BuildCacheDirectory -Force | Out-Null
    $path = Join-Path $script:BuildCacheDirectory "$Kind.json"
    $temp = "$path.$PID.tmp"
    $Values | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $temp -Encoding UTF8
    Move-Item -LiteralPath $temp -Destination $path -Force
  } catch { Write-ReleaseLog "Could not persist $Kind build cache; the next run will rebuild if needed" }
}

function Test-CachedBuild([string]$Kind, [string]$Directory) {
  $record = Read-BuildCache $Kind
  if (!$record) { return $false }
  try {
    $hash = Get-BuildTreeHash $Directory
    return ($hash -and $hash -eq $record.artifactHash)
  } catch { return $false }
}

function Clear-CachedBuild([string]$Kind) {
  foreach ($entry in @($Kind, $(if ($Kind -eq 'backend') { 'image' }))) {
    if (!$entry) { continue }
    $path = Join-Path $script:BuildCacheDirectory "$entry.json"
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
  }
}

function Save-CompletedBuild([string]$Kind, [string]$Directory) {
  Assert-BuildInputsUnchanged
  $hash = Get-BuildTreeHash $Directory
  if (!$hash) { throw "$Kind build output is missing, empty, or contains links" }
  Write-BuildCache $Kind @{ artifactHash = $hash }
}

function Assert-BuildInputsUnchanged {
  $dirty = Invoke-NativeCapture $script:GitCommand @('status', '--porcelain')
  if ($dirty.Trim() -or (Get-BuildInputKey) -ne $script:BuildCacheKey) {
    throw 'Build inputs changed during verification; refusing to deploy'
  }
}

function Get-ReusableBackendImage {
  $record = Read-BuildCache 'image'
  if (!$record) { return $null }
  try {
    if ($record.image -notmatch '^.+@sha256:[0-9a-f]{64}$') { return $null }
    $expectedDigest = ($record.image -split '@')[1]
    $digest = (Invoke-NativeCapture $script:GcloudCommand @(
      'artifacts', 'docker', 'images', 'describe', $record.image,
      "--project=$Project", '--format=value(image_summary.digest)'
    )).Trim()
    if ($digest -eq $expectedDigest) { return [string]$record.image }
  } catch { Write-ReleaseLog 'Cached backend image is unavailable; rebuilding from verified source' }
  return $null
}
