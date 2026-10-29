[CmdletBinding()]
param(
  [string]$Project = 'taxmyself-prod',
  [string]$Region = 'me-west1',
  [string]$SourceService = 'taxmys16elf-prod',
  [string]$VerifyJob = 'keepintax-smoke-verify',
  [string]$CleanupJob = 'keepintax-smoke-cleanup',
  [string]$Image,
  [string]$SourceJsonPath,
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

function Get-OptionalProperty([object]$InputObject, [string]$Name, $DefaultValue = $null) {
  if ($null -eq $InputObject) { return $DefaultValue }
  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) { return $DefaultValue }
  return $property.Value
}

function Assert-CloudName([string]$Name, [string]$Value) {
  if ($Value -notmatch '^[a-z][a-z0-9-]{0,62}$') {
    throw "$Name is not a valid Google Cloud resource name"
  }
}

function Get-SourceState {
  if ($SourceJsonPath) {
    if ($Apply) { throw 'SourceJsonPath cannot be used with Apply' }
    return (Get-Content -LiteralPath $SourceJsonPath -Raw | ConvertFrom-Json)
  }

  $json = & gcloud run services describe $SourceService `
    --project=$Project `
    --region=$Region `
    --format=json
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not read the Cloud Run backend service configuration'
  }
  return ($json | ConvertFrom-Json)
}

function Get-GcloudDictionary([hashtable]$Values) {
  if ($Values.Count -eq 0) { return $null }
  foreach ($value in $Values.Values) {
    if ([string]$value -match '[,\r\n]') {
      throw 'A gcloud dictionary value contains an unsupported delimiter'
    }
  }
  $pairs = @($Values.GetEnumerator() | Sort-Object Key | ForEach-Object {
    "$($_.Key)=$($_.Value)"
  })
  return ($pairs -join ',')
}

function Invoke-JobDeploy(
  [string]$JobName,
  [string]$Entrypoint,
  [string[]]$RequiredVariables,
  [string]$Timeout,
  [bool]$CopyNetwork
) {
  $plain = @{}
  $secrets = @{}
  foreach ($name in $RequiredVariables) {
    $item = $environment[$name]
    if ($item.kind -eq 'secret-reference') {
      $secrets[$name] = "$($item.secretName):$($item.secretVersion)"
    } else {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$item.value)
      $plain["${name}_B64"] = [Convert]::ToBase64String($bytes)
    }
  }
  $plain['NODE_ENV'] = 'production'

  $arguments = @(
    'run', 'jobs', 'deploy', $JobName,
    "--project=$Project",
    "--region=$Region",
    "--image=$jobImage",
    "--service-account=$runtimeServiceAccount",
    '--command=node',
    "--args=$Entrypoint",
    '--tasks=1',
    '--parallelism=1',
    '--max-retries=0',
    "--task-timeout=$Timeout",
    '--memory=512Mi',
    '--quiet'
  )

  $plainArgument = Get-GcloudDictionary $plain
  if ($plainArgument) { $arguments += "--set-env-vars=$plainArgument" }
  $secretArgument = Get-GcloudDictionary $secrets
  if ($secretArgument) { $arguments += "--set-secrets=$secretArgument" }

  if ($CopyNetwork) {
    if ($cloudSql) { $arguments += "--set-cloudsql-instances=$cloudSql" }
    if ($vpcConnector) { $arguments += "--vpc-connector=$vpcConnector" }
    if ($vpcEgress) { $arguments += "--vpc-egress=$vpcEgress" }
  }

  Write-Host "Deploying private Cloud Run job $JobName (configuration values are redacted)"
  & gcloud @arguments
  if ($LASTEXITCODE -ne 0) { throw "Failed to deploy Cloud Run job $JobName" }
}

foreach ($item in @{
  Project = $Project
  Region = $Region
  SourceService = $SourceService
  VerifyJob = $VerifyJob
  CleanupJob = $CleanupJob
}.GetEnumerator()) {
  Assert-CloudName $item.Key $item.Value
}

$verifyVariables = @(
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
)
$cleanupVariables = @(
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_DRIVE_ROOT_FOLDER_ID'
)
$sensitiveVariables = @(
  'FIREBASE_PRIVATE_KEY',
  'DB_PASSWORD',
  'GOOGLE_SERVICE_ACCOUNT_JSON'
)

$state = Get-SourceState
$template = $state.spec.template
$container = @($template.spec.containers)[0]
$sourceImage = [string]$container.image
$runtimeServiceAccount = [string]$template.spec.serviceAccountName
if (!$sourceImage -or !$runtimeServiceAccount) {
  throw 'The backend service is missing an image or runtime service account'
}
$jobImage = if ($Image) { $Image } else { $sourceImage }
if ($jobImage -notmatch '^.+@sha256:[0-9a-f]{64}$') {
  throw 'The job image must be an immutable sha256 image reference'
}

$environment = @{}
foreach ($item in @($container.env)) {
  $itemName = [string](Get-OptionalProperty $item 'name')
  if (!$itemName) { continue }
  $valueFrom = Get-OptionalProperty $item 'valueFrom'
  $secretKeyRef = Get-OptionalProperty $valueFrom 'secretKeyRef'
  $plainValue = Get-OptionalProperty $item 'value'
  if ($null -ne $secretKeyRef) {
    $environment[$itemName] = @{
      kind = 'secret-reference'
      secretName = [string](Get-OptionalProperty $secretKeyRef 'name')
      secretVersion = [string](Get-OptionalProperty $secretKeyRef 'key')
    }
  } elseif ($null -ne $plainValue) {
    $environment[$itemName] = @{
      kind = 'plain-value'
      value = [string]$plainValue
    }
  }
}

foreach ($name in $cleanupVariables) {
  if (!$environment.ContainsKey($name)) {
    throw "Required backend variable $name is missing"
  }
}
if ($environment['DB_DATABASE'].kind -ne 'plain-value' -or
    $environment['DB_DATABASE'].value -ne 'keepintax-prod') {
  throw 'The source backend DB_DATABASE must be the explicit plain value keepintax-prod'
}

$annotations = $template.metadata.annotations
$cloudSql = [string](Get-OptionalProperty $annotations 'run.googleapis.com/cloudsql-instances')
$vpcConnector = [string](Get-OptionalProperty $annotations 'run.googleapis.com/vpc-access-connector')
$vpcEgress = [string](Get-OptionalProperty $annotations 'run.googleapis.com/vpc-access-egress')
$securityWarnings = @(
  $sensitiveVariables | Where-Object { $environment[$_].kind -eq 'plain-value' }
)

$plan = [ordered]@{
  mode = if ($Apply) { 'apply' } else { 'plan-only' }
  project = $Project
  region = $Region
  sourceService = $SourceService
  image = $jobImage
  runtimeServiceAccount = $runtimeServiceAccount
  jobs = @(
    [ordered]@{ name = $VerifyJob; entrypoint = 'dist/smoke/verify-smoke-user.js'; networkCopied = $false },
    [ordered]@{ name = $CleanupJob; entrypoint = 'dist/smoke/cleanup-smoke-user.js'; networkCopied = $true }
  )
  securityWarnings = $securityWarnings
}

if (!$Apply) {
  $plan | ConvertTo-Json -Depth 5
  return
}
if ($env:SMOKE_CONFIGURE_JOBS -ne $Project) {
  throw "Set SMOKE_CONFIGURE_JOBS=$Project for this one-time production change"
}

Invoke-JobDeploy $VerifyJob 'dist/smoke/verify-smoke-user.js' $verifyVariables '2m' $false
Invoke-JobDeploy $CleanupJob 'dist/smoke/cleanup-smoke-user.js' $cleanupVariables '5m' $true

[ordered]@{
  status = 'configured'
  project = $Project
  region = $Region
  jobs = @($VerifyJob, $CleanupJob)
  securityWarnings = $securityWarnings
} | ConvertTo-Json -Depth 3
