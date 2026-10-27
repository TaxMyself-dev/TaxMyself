# KT-103 - Cloud Run job environment arguments

- Status: `COMPLETE — delivery pending`
- Task manager: Codex primary manager
- Worker: Codex primary manager (no delegated worker)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `7bb3dcc8f0891b9d6dcac93eac177c49e8b7cb50`

## Business outcome

Allow Stage 10 to create/update private Cloud Run smoke jobs with the backend's
plain-value environment configuration on Windows PowerShell.

## Acceptance criteria

- [x] Gcloud dictionary flags use a shell-stable comma-separated encoding.
- [x] Plain values remain Base64 encoded before crossing the command boundary.
- [x] Secret Manager references remain references.
- [x] Comma/newline values are rejected rather than ambiguously parsed.
- [x] Fixture plans and release regressions pass.
- [x] No production action is run by Codex.

## Constraints

- Never print fixture or production environment values from the deploy path.
- Preserve the immutable candidate image and double apply gate.

## Verification

- `scripts/tests/Deploy-Production.Tests.ps1`
  - PASS, including exact dictionary encoding, trailing Base64 padding and
    comma rejection, plus all existing release regressions.
- PowerShell parser checks for release/job scripts
  - PASS.
- `node --test tests/config.unit.test.js` from `smoke-tests/`
  - PASS — 8/8 tests.
- `git diff --check`
  - PASS (line-ending notices only; no whitespace errors).
