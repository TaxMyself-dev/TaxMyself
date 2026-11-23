# KT-118 - Manual allocation portal details

- Status: `PUSHED`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt118-worker`
- Branch: `codex/kt-118-manual-allocation-details`
- Base commit: `e02a708a`

## Business outcome

The manual-allocation dialog contains every value needed to complete the Tax
Authority form, without opening the pending document or PDF.

## Acceptance criteria

- [x] Show request type, reference number, customer identifier, date, pre-VAT amount and VAT amount.
- [x] Load and show the document line descriptions as the item/service description.
- [x] Values are selectable/read-only and remain available while the Tax Authority site is open.
- [x] A line-loading failure does not block entering the allocation number.
- [x] Focused component-flow tests and the Angular production build pass.

## Scope and constraints

- In scope: incomes manual-allocation dialog, line-description loading, focused tests and topic documentation.
- Out of scope: Tax Authority site automation, document/accounting behavior, backend/database/schema changes, deployment.

## Handoff

- Result: The manual-allocation dialog now exposes portal-ready, selectable
  document values and loads line descriptions without making that load a
  prerequisite for entering an allocation number.
- Commit hash(es): `9d2d7688`
- Tests and exact results:
  - Focused Karma spec `incomes-shaam-confirmation.spec.ts`: `7 SUCCESS`.
  - Angular production build: passed (existing bundle/style/CommonJS warnings only).
- Schema / production / security / accounting / external impact: none expected.
- Risks and manual checks: compare field labels and values with the Tax Authority form in light/mobile layouts.
- Documentation updated: `frontend/src/app/pages/book-keeping/AGENTS.md`.

## Integration

- Reviewed by: Codex primary
- Integrated commit: `2c2c3b6b` (feature commit `9d2d7688`)
- Combined verification: component-behavior tier; focused Karma spec passed
  `7 SUCCESS`, and the Angular production build passed with existing
  bundle/style/CommonJS warnings only. No unrelated suites were run.
- `origin/main` verification: local `main`, tracking `origin/main` and remote
  `refs/heads/main` all resolved to `2c2c3b6b` after the code push.
- User-visible run instructions: refresh/restart the frontend and choose manual
  allocation from a pending-allocation document. This Git push is not a
  production deployment.
