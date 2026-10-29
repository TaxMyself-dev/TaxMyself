# KT-100 - Production release targets

- Status: `COMPLETE - ready for local commit`
- Task manager: Codex primary manager
- Worker: Codex primary manager (no delegated worker)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `ac2021ff3a6e263b8105a83444ec663055669b83`

## Business outcome

Allow an operator to release the full application, backend only, or frontend
only from the same guarded script, with an optional fast path that skips local
test suites without removing production safety gates.

## Acceptance criteria

- [x] `Target=Full|Backend|Frontend` selects only the intended build/deploy
  stages and preserves scoped rollback.
- [x] Backend-only releases retain candidate readiness, exact revision
  promotion, smoke-job image updates, and full live compatibility smoke.
- [x] Frontend-only releases retain preview smoke, live backup/promotion, and
  full live smoke against the currently serving backend.
- [x] `SkipLocalTests` skips only local Jest/configuration tests; builds,
  candidate readiness, browser smoke, and cleanup remain mandatory.
- [x] Plan/log output records the selected target and verification policy.
- [x] Fixture-backed regression tests cover every target and skip mode.

## Constraints

- No production execution by Codex.
- No option may bypass production readiness, browser smoke, cleanup, or
  rollback for a component being changed.
- Full remains the default for backward compatibility.

## Handoff

- Result: Added guarded full/backend/frontend targets and a local-test-only
  fast path while retaining all deployed-environment safety gates.
- Commit hash(es): this task's implementation commit
- Changed files: `scripts/Deploy-Production.ps1`,
  `scripts/tests/Deploy-Production.Tests.ps1`, `scripts/AGENTS.md`,
  `docs/operations/production-smoke.md`, and this task file.
- Tests: PowerShell parser; `scripts/tests/Deploy-Production.Tests.ps1`;
  `git diff --check`.
- Production impact: none; operator must run the resulting script
