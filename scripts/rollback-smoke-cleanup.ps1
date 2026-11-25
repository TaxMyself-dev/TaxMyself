function Invoke-SmokeCleanupAfterRollback {
  if (!$script:SmokeStatePath -or !(Test-Path -LiteralPath $script:SmokeStatePath)) { return }
  $state = Get-Content -LiteralPath $script:SmokeStatePath -Raw | ConvertFrom-Json
  if ($state.version -ne 1 -or $state.runId -cnotmatch '^[a-z]{12,32}$' -or
      $state.project -ne $Project -or $state.project -ne 'taxmyself-prod' -or
      $state.region -ne $Region -or $state.region -ne 'me-west1' -or
      $state.cleanupJob -ne 'keepintax-smoke-cleanup' -or
      $state.cleanupCompleted -isnot [bool]) {
    throw 'Invalid smoke recovery state; refusing to guess cleanup targets'
  }
  if ($state.cleanupCompleted) { return }
  Invoke-Stage 'ROLLBACK: clean up exact smoke run' {
    Invoke-Native $script:GcloudCommand @(
      'run', 'jobs', 'execute', 'keepintax-smoke-cleanup',
      "--project=$Project", "--region=$Region", '--wait',
      "--update-env-vars=SMOKE_CLEANUP_ENABLED=true,SMOKE_RUN_ID=$($state.runId)"
    )
    $state.cleanupCompleted = $true
    $state | ConvertTo-Json | Set-Content -LiteralPath $script:SmokeStatePath -Encoding UTF8
  }
}
