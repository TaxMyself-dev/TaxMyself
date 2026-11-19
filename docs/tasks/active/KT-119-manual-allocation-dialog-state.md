# KT-119 - Preserve manual-allocation dialog state

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt119-worker`
- Branch: `codex/kt-119-manual-allocation-dialog-state`
- Base commit: `a2b80bf5`

## Business outcome

Choosing manual allocation opens one persistent dialog containing the Tax
Authority link, all copyable document details and the allocation-number input.

## Acceptance criteria

- [x] Closing the method-choice dialog during the manual transition does not clear the selected document.
- [x] All Tax Authority fields remain visible in the manual dialog while its external link is open in another tab/window.
- [x] Explicitly closing or cancelling the manual dialog still clears its state.
- [x] The focused allocation-flow tests and Angular production build pass.

## Scope and constraints

- In scope: incomes allocation-dialog state transition, regression test and topic documentation.
- Out of scope: backend, database, accounting, Tax Authority automation, deployment.

## Handoff

- Result: The method-dialog `onHide` now preserves the selected row whenever
  the manual allocation dialog is already open, while an explicit method-dialog
  dismissal still clears it.
- Commit hash(es): pending
- Tests and exact results:
  - Focused Karma spec `incomes-shaam-confirmation.spec.ts`: `8 SUCCESS`.
  - Angular production build: passed (existing budget/CommonJS warnings only).
- Schema / production / security / accounting / external impact: none expected.
- Risks / manual checks: verify the manual dialog stays populated after the choice dialog hide animation.
- Documentation updated: `frontend/src/app/pages/book-keeping/AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
