# Automatic test deployment reauthentication

- Status: `TEST_INTEGRATED`
- Branch: `codex/deploy-test-auth`
- Base commit: `7426dd44223a621183799a8d4139616011bcb029`

## Acceptance criteria

- Test preflight follows production's check-login-recheck behavior.
- Reuse valid sessions without interactive login; recover failed Firebase access
  with login --reauth and failed gcloud access with auth login.
- Invoke login directly so browser/terminal prompts are available.
- Recheck the same target before installs, builds or deployment. Cancellation,
  failed login or failed recheck blocks progress with a named stage.
- One login attempt only; select only providers required by the target.
- Preserve clean-test/fresh-origin equality checks, side-effect-free Help/Plan,
  fixed DEV cloud identifiers and PowerShell 5.1/7 compatibility.

## Verification

- powershell.exe -NoProfile -File scripts/tests/deploy-test.Tests.ps1: PASS,
  74 checks. Coverage includes valid sessions, each provider's recovered session,
  target isolation, cancelled login and persistent access failure.
- pwsh -NoProfile -File scripts/tests/deploy-test.Tests.ps1: PASS, 74 checks.
- cmd /c scripts\deploy-test.cmd frontend -Plan: PASS.
- cmd /c scripts\deploy-test.cmd -Help: PASS.
- git diff --check: PASS.
- Production script and application code unchanged; no application build or
  real cloud login/deployment required or executed. Credentials never displayed
  or stored. Backend/.env copied from primary checkout and verified ignored.

## Approval boundaries

Elazar explicitly approved integration into test, pushing test, and local main
integration. Main push remains forbidden.

Integrated feature commit 87f38135 onto test base 31a34cfe without conflicts.
Both offline test commands above were rerun on the integrated test tree:
74 checks PASS in Windows PowerShell 5.1 and 74 checks PASS in PowerShell 7.
git diff --cached --check: PASS. No executable changes after verification.
No actual cloud login or deployment performed.

## Documentation

scripts/AGENTS.md and docs/operations/test-deployment.md describe the behavior.
