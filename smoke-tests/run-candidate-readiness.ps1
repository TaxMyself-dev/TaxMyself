[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ApiUrl,
  [string]$BrowserChannel = 'chrome'
)

$ErrorActionPreference = 'Stop'
$parsedApiUrl = $null
if (![uri]::TryCreate($ApiUrl, [UriKind]::Absolute, [ref]$parsedApiUrl) -or
    $parsedApiUrl.Scheme -ne 'https') {
  throw 'ApiUrl must be an absolute HTTPS URL'
}

$previousApiUrl = $env:SMOKE_API_URL
$previousBrowser = $env:SMOKE_BROWSER_CHANNEL
try {
  $env:SMOKE_API_URL = $parsedApiUrl.AbsoluteUri
  $env:SMOKE_BROWSER_CHANNEL = $BrowserChannel
  Push-Location $PSScriptRoot
  try {
    & npm run smoke:readiness
    if ($LASTEXITCODE -ne 0) {
      throw "Candidate readiness failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
} finally {
  $env:SMOKE_API_URL = $previousApiUrl
  $env:SMOKE_BROWSER_CHANNEL = $previousBrowser
}
