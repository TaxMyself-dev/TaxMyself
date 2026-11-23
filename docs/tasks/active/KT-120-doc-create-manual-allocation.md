# KT-120 - Manual allocation from document creation

- Status: `PUSHED`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt120-worker`
- Branch: `codex/kt-120-doc-create-manual-allocation`
- Base commit: `8cc1ae96`

## Business outcome

The mandatory allocation decision shown during document creation offers the
same manual-allocation route as the incomes page.

## Acceptance criteria

- [x] Add a bordered white "הפק מספר הקצאה באופן ידני" action to the decision dialog.
- [x] Persist the numbered pending document and journal entry before opening the manual flow.
- [x] Navigate to the incomes manual dialog with the persisted document details.
- [x] Run only the isolated manual-action spec and Angular production build.

## Scope and constraints

- In scope: doc-create allocation decision, pending-success navigation state, isolated tests and topic documentation.
- Out of scope: backend, database/schema, accounting behavior, Tax Authority automation, deployment.

## Handoff

- Result: The allocation decision now includes a manual action that saves the
  pending document and opens the existing populated manual dialog on incomes.
- Commit hash(es): `903318c9`
- Tests and exact results:
  - Isolated `doc-create-manual-allocation.spec.ts`: `1 SUCCESS`.
  - Angular production build: passed (existing budget/CommonJS warnings only).
- Schema / production / security / accounting / external impact: none expected.
- Risks / manual checks: issue a mandatory-allocation invoice and confirm the manual dialog opens populated.
- Documentation updated: `frontend/src/app/pages/doc-create/AGENTS.md`.

## Integration

- Reviewed by: Codex primary
- Integrated commit: `9dde9e6b` (feature commit `903318c9`)
- Combined verification: one isolated manual-action Karma test passed
  (`1 SUCCESS`), followed by a passing Angular production build with existing
  budget/CommonJS warnings. No other test suites ran.
- `origin/main` verification: local `main`, tracking `origin/main` and remote
  `refs/heads/main` all resolved to `9dde9e6b` after the code push.
- User-visible run instructions: refresh/restart the frontend, create an invoice
  that requires allocation and choose the new manual action. This Git push is
  not a production deployment.
