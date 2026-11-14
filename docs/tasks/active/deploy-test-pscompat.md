# Test deployment Windows PowerShell compatibility

- Status: `TEST_INTEGRATED`
- Branch: `codex/deploy-test-pscompat`
- Base commit: `828f4976acc188913884c0602327ea5121820c26`

## Acceptance criteria and result

- Fix deployment failing under Windows PowerShell 5.1 because IsWindows does not
  exist there. Detect Windows using env:OS, available in both supported shells.
- Native CLI stderr remains diagnostic; nonzero native exit codes still fail.
- CMD launcher uses built-in powershell.exe, avoiding a PowerShell 7 dependency.
- Offline tests use the current shell executable and an encoded native probe so
  they test real PowerShell 5.1 and 7 argument/stderr behavior.

## Verification

- Baseline: `powershell.exe -NoProfile -File scripts/tests/deploy-test.Tests.ps1`
  failed with VariableIsUndefined for IsWindows, reproducing the user report.
- Final: same command PASS, 52 checks.
- Final: `pwsh -NoProfile -File scripts/tests/deploy-test.Tests.ps1`
  PASS, 52 checks.
- Initial compatibility test run exposed a legacy-shell quote-stripping issue
  in the test probe. Replaced it with EncodedCommand; both final runs passed.
- `cmd /c scripts\deploy-test.cmd frontend -Plan`: PASS; no cloud actions.
- `git diff --check`: PASS.
- Application source unchanged; application builds and actual cloud deployment
  not run. Production deployment script unchanged.
- Ignored backend/.env copied from primary checkout without displaying values.
- Documentation updated: scripts/AGENTS.md, docs/operations/test-deployment.md.

## Approval boundary

Elazar explicitly approved integrating this fix into test and pushing test.
Applied only fix commit 11742bc5 on test base f4c1c31c (no main changes).
Reverified on the integrated test tree:
- powershell.exe -NoProfile -File scripts/tests/deploy-test.Tests.ps1: PASS, 52 checks.
- pwsh -NoProfile -File scripts/tests/deploy-test.Tests.ps1: PASS, 52 checks.
- cmd /c scripts\deploy-test.cmd frontend -Plan: PASS.
No executable changes followed verification; documentation only was updated.
Main integration remains unauthorized and main was not changed.
No actual deployment was run.
