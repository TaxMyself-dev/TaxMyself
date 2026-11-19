# KT-121 - SHAAM connection-check loading

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt121-worker`
- Branch: `codex/kt-121-shaam-connection-loading`
- Base commit: `80dcf41a`

## Business outcome

Automatic allocation gives immediate, continuous feedback from the connection
check through the allocation request instead of leaving an unexplained blank interval.

## Acceptance criteria

- [x] Show "בודק חיבור לרשות המסים" immediately after the automatic action.
- [x] Switch the same modal to "מפיק מספר הקצאה" after a usable connection is confirmed.
- [x] Keep the modal visible while the pending document is saved and the allocation request runs.
- [x] Close the modal on no connection or error so the appropriate feedback can appear.
- [x] Run only an isolated loading-state spec and Angular production build.

## Scope and constraints

- In scope: doc-create automatic-allocation loading state, modal copy, focused tests and topic documentation.
- Out of scope: provider/API behavior, backend, database/schema, accounting, deployment.

## Handoff

- Result: Automatic allocation now shows one continuous modal that changes from
  connection checking to allocation issuance and closes on terminal outcomes.
- Commit hash(es): pending
- Tests and exact results:
  - Isolated `doc-create-shaam-loading.spec.ts`: `2 SUCCESS`.
  - Angular production build: passed (existing budget/CommonJS warnings only).
- Schema / production / security / accounting / external impact: none expected.
- Risks / manual checks: observe the modal transition with a connected and disconnected business.
- Documentation updated: `frontend/src/app/pages/doc-create/AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
