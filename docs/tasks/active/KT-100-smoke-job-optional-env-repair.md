# KT-100 - Smoke job optional environment repair

- Status: `COMPLETE — delivery pending`
- Task manager: Codex primary manager
- Worker: Codex primary manager (no delegated worker)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `f3899d2dc12d5b4225dc68f85bfc0e331a27ffad`

## Business outcome

Allow the guarded production release to configure its private smoke jobs when
the source Cloud Run service uses ordinary environment values that omit the
optional `valueFrom` property.

## Acceptance criteria

- [x] Plain and Secret Manager-backed environment entries are parsed safely
  while PowerShell strict mode is active.
- [x] Optional network annotations are parsed safely when absent.
- [x] Both smoke configuration scripts parse and pass fixture-backed checks.
- [x] Production release regression checks remain green.
- [x] No production command, traffic change, job update, or deployment is run
  by Codex.

## Constraints

- Never print or persist production environment values or secret identifiers.
- Preserve the existing production gates and exact immutable image requirement.

## Verification

- `scripts/tests/Deploy-Production.Tests.ps1`
  - PASS, including strict-mode plain/secret environment fixtures.
- PowerShell parser checks for the release, job configuration and inventory
  scripts
  - PASS.
- `node --test tests/config.unit.test.js` from `smoke-tests/`
  - PASS — 8/8 tests.
- `git diff --check`
  - PASS (line-ending notices only; no whitespace errors).
