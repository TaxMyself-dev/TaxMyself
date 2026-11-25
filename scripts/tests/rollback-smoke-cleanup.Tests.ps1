$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $root 'scripts/rollback-smoke-cleanup.ps1')
$Project='taxmyself-prod'; $Region='me-west1'; $HostingSite='test-site'
$script:GcloudCommand='gcloud-stub'; $script:FirebaseCommand='firebase-stub'
$script:stages=[System.Collections.Generic.List[string]]::new()
$script:commands=[System.Collections.Generic.List[object]]::new()
$script:logs=[System.Collections.Generic.List[string]]::new()
$script:failRollback=$false; $script:failCleanup=$false
function Invoke-Native($Command,$Arguments) {
  $script:commands.Add(@($Arguments))
  if ($script:failCleanup -and $Arguments[0] -eq 'run' -and $Arguments[1] -eq 'jobs') { throw 'cleanup failed' }
}
function Invoke-Stage($Name,$Action) {
  $script:stages.Add($Name)
  if ($script:failRollback -and $Name -match 'restore previous') { throw 'rollback failed' }
  & $Action
}
function Write-ReleaseStatus($State,$Message,$Color) { $script:logs.Add("${State}:$Message") }
function Write-ReleaseLog($Record) { $script:logs.Add([string]$Record) }
function Assert-BackendTraffic($Revision) {}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('smoke-rollback-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
function Save-State($patch=@{}) {
  $state=@{version=1;runId='abcdefghijklmnop';project=$Project;region=$Region;cleanupJob='keepintax-smoke-cleanup';cleanupCompleted=$false}
  foreach($key in $patch.Keys){$state[$key]=$patch[$key]}
  $state | ConvertTo-Json | Set-Content -LiteralPath $script:SmokeStatePath -Encoding UTF8
}
try {
  $script:SmokeStatePath=Join-Path $temp 'missing.json'
  Invoke-SmokeCleanupAfterRollback
  if($script:commands.Count){throw 'No state must mean no cleanup'}
  $script:SmokeStatePath=Join-Path $temp 'state.json'
  Save-State
  Invoke-SmokeCleanupAfterRollback
  if($script:commands.Count -ne 1 -or ($script:commands[0] -join '|') -notmatch 'SMOKE_RUN_ID=abcdefghijklmnop') {throw 'Exact-run cleanup was not invoked'}
  Invoke-SmokeCleanupAfterRollback
  if($script:commands.Count -ne 1){throw 'Completed cleanup was repeated'}
  foreach($patch in @(@{runId='OTHERUSER'},@{project='other-project'},@{region='elsewhere'},@{cleanupJob='other-job'},@{cleanupCompleted='false'})) {
    Save-State $patch
    $failed=$false
    try {Invoke-SmokeCleanupAfterRollback}catch{$failed=$true}
    if(!$failed -or $script:commands.Count -ne 1){throw 'Malformed recovery state permitted a cloud call'}
  }
  $ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'scripts/deploy.ps1'),[ref]$null,[ref]$null)
  $clause=$ast.Find({param($n) $n -is [System.Management.Automation.Language.CatchClauseAst] -and $n.Extent.Text.Contains('Original failure:')},$true)
  if(!$clause){throw 'Production rollback handler not found'}
  $body=$clause.Body.Extent.Text
  $replay=[scriptblock]::Create($body.Substring(1,$body.Length-2).Replace('exit 1',"throw 'expected_exit_1'"))
  foreach($scenario in @('normal','restore-failed','cleanup-failed')) {
    Save-State
    $script:stages.Clear();$script:commands.Clear();$script:logs.Clear()
    $script:failRollback=$scenario -eq 'restore-failed'; $script:failCleanup=$scenario -eq 'cleanup-failed'
    $script:CandidateRevision='candidate';$script:BackendPromoted=$true;$script:OldBackendRevision='old'
    $script:FrontendDeploymentStarted=$true;$script:FrontendBackupCreated=$true;$script:BackupChannel='rollback-current'
    $script:CurrentStage='Full production signup, login, and cleanup smoke';$script:StageResults=@()
    $exitObserved=$false
    try {try {throw 'original smoke failure'} catch {& $replay}} catch {if($_.Exception.Message -eq 'expected_exit_1'){$exitObserved=$true}else{throw}}
    if(!$exitObserved){throw 'Failed deployment must still return exit 1'}
    $expected=@('ROLLBACK: restore previous Firebase live release','ROLLBACK: restore previous backend revision','ROLLBACK: clean up exact smoke run')
    if(($script:stages -join '|') -ne ($expected -join '|')){throw "Cleanup did not follow both rollback attempts: $scenario"}
    if(!@($script:logs | Where-Object {$_ -like 'Original failure:*original smoke failure'}).Count){throw 'Original deployment error was lost'}
    $state=Get-Content -LiteralPath $script:SmokeStatePath -Raw | ConvertFrom-Json
    if($state.cleanupCompleted -eq $script:failCleanup){throw 'Cleanup completion state is incorrect'}
  }
  Write-Output 'rollback cleanup tests passed'
} finally {
  $resolved=[IO.Path]::GetFullPath($temp)
  $allowed=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  if(!$resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'smoke-rollback-test-*'){throw 'Unsafe test cleanup path'}
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
