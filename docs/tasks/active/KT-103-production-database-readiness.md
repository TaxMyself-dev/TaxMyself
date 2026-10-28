# KT-103 - Production database readiness identity

- Status: `COMPLETE - ready for local commit`
- Task manager: Codex primary manager
- Worker: Codex primary manager (no delegated worker)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `d5a3d58c`

## Business outcome

Prevent a backend candidate from receiving production traffic when its runtime
database connection points anywhere other than `keepintax-prod`.

## Acceptance criteria

- [x] `/ready` reads the database selected by the live connection.
- [x] Readiness succeeds only when `DATABASE()` is exactly `keepintax-prod`.
- [x] A mismatch returns a generic failure without exposing connection secrets.
- [x] Candidate smoke asserts the new database-target readiness result.
- [x] Tests cover the correct target, a wrong target, and query failure.

## Scope and constraints

- In scope: candidate/live readiness only.
- Out of scope: connecting to production before the backend build.
- Required reading: `backend/src/smoke/AGENTS.md`.
- Approval boundaries: no production execution by Codex.

## Handoff

- Result: Candidate readiness now rejects every runtime database target except
  the compiled `keepintax-prod` identity before checking signup schema.
- Commit hash(es): this task's implementation commit
- Changed files: `backend/src/readiness.service.ts`, its focused spec,
  `backend/src/app.controller.ts`, `smoke-tests/tests/production-readiness.spec.js`,
  topic documentation, the production smoke runbook, and this task file.
- Tests and exact results: focused Jest 4/4 passed; backend build passed;
  smoke readiness JavaScript syntax passed; smoke unit tests 10/10 passed.
- Schema / production / security / accounting / external impact: read-only
  metadata query; no schema or data writes
- Risks and manual checks: the authoritative identity check intentionally runs
  after the zero-traffic candidate build and before promotion; no direct
  pre-build production DB connection was added.
- Documentation updated: backend smoke topic, smoke-tests topic, and production
  smoke runbook.
