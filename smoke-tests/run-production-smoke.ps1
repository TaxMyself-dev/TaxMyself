[CmdletBinding()]
param(
  [string]$ApiUrl = 'https://taxmys16elf-prod-tau7bgxb3q-zf.a.run.app',
  [string]$BrowserChannel = 'chrome'
)

$ErrorActionPreference = 'Stop'
if ($env:SMOKE_RUN_PRODUCTION -ne 'app.keepintax.co.il') {
  throw 'Set SMOKE_RUN_PRODUCTION=app.keepintax.co.il to authorize the write-capable production smoke run'
}

$parsedApiUrl = $null
if (![uri]::TryCreate($ApiUrl, [UriKind]::Absolute, [ref]$parsedApiUrl) -or
    $parsedApiUrl.Scheme -ne 'https') {
  throw 'ApiUrl must be an absolute HTTPS URL'
}

$names = @(
  'SMOKE_WEB_URL',
  'SMOKE_API_URL',
  'SMOKE_VERIFY_JOB',
  'SMOKE_CLEANUP_JOB',
  'SMOKE_GCP_PROJECT',
  'SMOKE_GCP_REGION',
  'SMOKE_BROWSER_CHANNEL'
)
$previous = @{}
foreach ($name in $names) {
  $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
  $env:SMOKE_WEB_URL = 'https://app.keepintax.co.il'
  $env:SMOKE_API_URL = $parsedApiUrl.AbsoluteUri
  $env:SMOKE_VERIFY_JOB = 'keepintax-smoke-verify'
  $env:SMOKE_CLEANUP_JOB = 'keepintax-smoke-cleanup'
  $env:SMOKE_GCP_PROJECT = 'taxmyself-prod'
  $env:SMOKE_GCP_REGION = 'me-west1'
  $env:SMOKE_BROWSER_CHANNEL = $BrowserChannel

  Push-Location $PSScriptRoot
  try {
    & npm run smoke:signup
    if ($LASTEXITCODE -ne 0) {
      throw "Production smoke run failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
} finally {
  foreach ($name in $names) {
    [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
  }
}
