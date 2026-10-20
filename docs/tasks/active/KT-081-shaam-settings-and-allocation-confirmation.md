# KT-081 - SHAAM connection settings and allocation confirmation

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `3d47dd284ef9abeec3ae6fb16ac35729500bd0a7`

## Business outcome

Users can see the Tax Authority connection status for each business and deliberately reconnect it from Settings. Resuming a pending allocation request requires explicit confirmation, preventing accidental allocation requests.

## Acceptance criteria

- [x] The Settings permissions tab displays SHAAM invoice-allocation connection status per business.
- [x] A connected business offers an explicit reconnect action; an unconnected business offers a connect action.
- [x] Reconnect starts a new OAuth flow even when the current connection is active.
- [x] Clicking the pending-document allocation action shows the document number and does not call SHAAM until the user confirms.
- [x] Cancelling the confirmation performs no SHAAM request.
- [x] Focused frontend tests and the frontend build pass.

## Scope and constraints

- In scope: Settings UI/status loading/OAuth initiation; pending-document confirmation; focused tests and topic docs.
- Out of scope: token storage changes, a disconnect endpoint, SHAAM API contract changes, production deployment.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`, Settings, bookkeeping, and SHAAM topic docs.
- Approval boundaries: user explicitly approved implementation; no external or production mutations.

## Handoff

- Result: complete
- Commit hash(es):
- Changed files: Settings SHAAM status/connect UI and tests; incomes allocation
  confirmation and tests; Settings/bookkeeping topic docs; this task record.
- Tests and exact results:
  - Focused Angular/Karma: 2 spec files, 4 tests passed.
  - Angular production build: passed with exit code 0 and existing bundle/style
    budget and CommonJS warnings.
- Known pre-existing failures: the default test TypeScript configuration
  compiles legacy broken specs and lacks Node typings. The focused run used a
  temporary narrowed tsconfig and a no-GPU headless launcher; both temporary
  changes were reverted before delivery.
- Schema / production / security / accounting / external impact: no schema,
  data, accounting, backend authorization, or external API contract change.
  Reconnect intentionally replaces the existing invoice-allocation OAuth grant.
  Source delivery only; no production access or deployment.
- Risks and manual checks: verify the multi-business status rows and OAuth
  redirect in production after frontend deployment; cancel one pending
  allocation confirmation and verify no network request is emitted.
- Documentation updated: Settings and bookkeeping topic docs plus this task.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
