[CmdletBinding()]
param(
  [string]$Project = 'taxmyself-prod',
  [string]$Region = 'me-west1',
  [string]$Service = 'taxmys16elf-prod',
  [string]$SourceJsonPath
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

Assert-CloudName 'Project' $Project
Assert-CloudName 'Region' $Region
Assert-CloudName 'Service' $Service

$stateJson = if ($SourceJsonPath) {
  Get-Content -LiteralPath $SourceJsonPath -Raw
} else {
  $result = & gcloud run services describe $Service `
    --project=$Project `
    --region=$Region `
    --format=json
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not read the Cloud Run backend service configuration'
  }
  $result
}

$state = $stateJson | ConvertFrom-Json
$template = $state.spec.template
$container = @($template.spec.containers)[0]
if (!$container.image -or !$template.spec.serviceAccountName) {
  throw 'The backend service is missing an image or runtime service account'
}

$environment = @{}
foreach ($item in @($container.env)) {
  $itemName = [string](Get-OptionalProperty $item 'name')
  if (!$itemName) { continue }
  $valueFrom = Get-OptionalProperty $item 'valueFrom'
  $secretKeyRef = Get-OptionalProperty $valueFrom 'secretKeyRef'
  $plainValue = Get-OptionalProperty $item 'value'
  if ($null -ne $secretKeyRef) {
    $environment[$itemName] = 'secret-reference'
  } elseif ($null -ne $plainValue) {
    $environment[$itemName] = 'plain-value'
  } else {
    $environment[$itemName] = 'unsupported'
  }
}

$verifyVariables = @(
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
)
$cleanupVariables = @(
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_DRIVE_ROOT_FOLDER_ID'
)
$mustBeSecret = @(
  'FIREBASE_PRIVATE_KEY',
  'DB_PASSWORD',
  'GOOGLE_SERVICE_ACCOUNT_JSON'
)

$variableStatus = [ordered]@{}
foreach ($name in ($verifyVariables + $cleanupVariables | Select-Object -Unique)) {
  $source = if ($environment.ContainsKey($name)) {
    $environment[$name]
  } else {
    'missing'
  }
  $variableStatus[$name] = [ordered]@{
    source = $source
    available = ($source -eq 'plain-value' -or $source -eq 'secret-reference')
    secretManagerBacked = ($name -notin $mustBeSecret -or $source -eq 'secret-reference')
  }
}

$annotations = $template.metadata.annotations
$cloudSql = Get-OptionalProperty $annotations 'run.googleapis.com/cloudsql-instances'
$vpcConnector = Get-OptionalProperty $annotations 'run.googleapis.com/vpc-access-connector'
$vpcEgress = Get-OptionalProperty $annotations 'run.googleapis.com/vpc-access-egress'
$missingCount = @($variableStatus.Values | Where-Object { !$_.available }).Count
$securityWarnings = @(
  $mustBeSecret | Where-Object { $variableStatus[$_].source -eq 'plain-value' }
)

[ordered]@{
  project = $Project
  region = $Region
  sourceService = $Service
  image = $container.image
  runtimeServiceAccount = $template.spec.serviceAccountName
  network = [ordered]@{
    cloudSqlConfigured = [bool]$cloudSql
    vpcConnectorConfigured = [bool]$vpcConnector
    vpcEgress = if ($vpcEgress) { $vpcEgress } else { 'default' }
  }
  requiredVariables = $variableStatus
  readyToConfigureJobs = ($missingCount -eq 0)
  secretsBackedBySecretManager = ($securityWarnings.Count -eq 0)
  securityWarnings = $securityWarnings
} | ConvertTo-Json -Depth 5
