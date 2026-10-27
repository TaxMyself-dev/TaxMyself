# KT-102 - Native stderr release logging

- Status: `COMPLETE — delivery pending`
- Task manager: Codex primary manager
- Worker: Codex primary manager (no delegated worker)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `e95d4d6f748d0ab3a7786ae4489c97f06a54bbab`

## Business outcome

Keep successful CLI progress written to stderr in the detailed release log
without misclassifying it as a fatal PowerShell error.

## Acceptance criteria

- [x] Native stdout and stderr are logged without reaching the terminal.
- [x] Native success/failure is determined by exit code, not by use of stderr.
- [x] PowerShell/cmdlet failures remain terminating and concise on terminal.
- [x] Nested smoke scripts use the same native logging boundary.
- [x] A fixture reproduces successful native stderr under Windows PowerShell
  strict/error-stop behavior.
- [x] No production action is run by Codex.

## Constraints

- Preserve interactive browser authentication and stdin behavior.
- Preserve stdout-only JSON capture for gcloud/Firebase parsing.
- Never log intentionally redacted production configuration values.

## Verification

- `scripts/tests/Deploy-Production.Tests.ps1`
  - PASS, including native stderr with exit 0, stdout-only capture with stderr,
    native exit 7, quiet terminal, and detailed/failure logs.
- PowerShell parser checks for release and nested smoke scripts
  - PASS.
- `node --test tests/config.unit.test.js` from `smoke-tests/`
  - PASS — 8/8 tests.
- `git diff --check`
  - PASS (line-ending notices only; no whitespace errors).
