# KT-098 - Production release orchestrator

- Status: `COMPLETE` — verified locally and approved for source delivery
- Task manager: Codex primary manager
- Worker: Codex primary manager (no delegated worker)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `ef2fc7bd6582f3421abc5f19d4076136080535a7`

## Business outcome

Provide one guarded PowerShell entrypoint for repeatable production releases:
local verification, zero-traffic backend candidate, readiness gate, smoke-job
bootstrap/update, exact revision promotion, frontend backup/deploy, full smoke,
and automatic rollback with stage-specific diagnostics.

## Acceptance criteria

- [x] A plan mode performs no writes and clearly lists the intended release.
- [x] Apply mode requires an explicit production gate and a clean `main` equal
  to `origin/main`.
- [x] Release and Cloud Run tags include local date, time, and a monotonically
  increasing sequence derived from prior script-created revisions.
- [x] Every stage prints START and OK; failures print FAILED, stage, and reason.
- [x] Backend deploys with zero traffic and is promoted only after candidate
  readiness and exact-image smoke-job configuration succeed.
- [x] The current Firebase live release is backed up before frontend deploy.
- [x] Frontend content is checked on a Firebase preview channel and that exact
  version is cloned to live only after read-only smoke succeeds.
- [x] A post-promotion failure attempts frontend/backend rollback and reports
  rollback failures without hiding the original failure.
- [x] Local syntax, fixture, focused smoke tests, and relevant builds pass.

## Constraints

- No production command is executed during implementation or verification.
- No schema migration or production data maintenance is part of this script.
- Production plan/apply execution remains an operator action under
  `docs/coordination/PRODUCTION_POLICY.md`.
- Production credentials and environment values must never be printed or
  persisted into repository files or release artifacts.

## Handoff

- Result: implementation complete and locally verified; production plan/apply
  has not been run
- Commit hash(es): this task's delivery commit (see Git history)
- Changed files: `scripts/Deploy-Production.ps1`, release plan/failure fixtures,
  `scripts/AGENTS.md`, exact-image support in
  `smoke-tests/configure-cloud-run-jobs.ps1`, smoke fixture image references,
  root topic index, production smoke runbook, and this task record.
- Tests: release-script syntax/plan/sequence/failure/apply-guard suite passed;
  all related PowerShell scripts parsed; smoke config tests passed 8/8;
  exact immutable job-image override fixture passed; backend readiness/smoke
  Jest suites passed 4 suites/20 tests. The backend production build from the
  preceding smoke delivery remains green; no backend/frontend application code
  changed in this task.
- Production impact: none; script has not been run with `-Apply`
