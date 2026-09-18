# KT-030 - Admin creates an expense accounting section

- Status: `WORKER_COMPLETE`
- Task manager: Codex
- Worker: Codex (isolated worktree)
- Worktree: `tmp/pdfs/kt030`
- Branch: `codex/kt030-add-section`
- Base commit: `73e173a1133a8be6b83948dc8d1c51ca9e51ee2b`

## Business outcome

An admin can create a SYSTEM expense section with a suggested code that can be edited before saving.

## Acceptance criteria

- [x] Admin catalog offers a create-section form with name and editable suggested code.
- [x] Server rejects occupied section/code blocks and concurrent duplicate codes; only admins can create.
- [x] Created section appears in the card section picker without a schema or seed change.
- [x] Focused tests and backend/frontend builds pass.

## Scope and constraints

- In scope: SYSTEM expense sections; editable 100-aligned code in the SYSTEM expense range.
- Out of scope: income, accountant/client-owned sections, renumbering existing cards, production deployment.
- Required reading: root and topic AGENTS, redesign master plan, coordination workflow/authority/quality gates.
- Approval boundaries: no schema, production, journal, or report-total changes.

## Handoff

- Result: Complete in isolated worktree.
- Commit hash(es):
- Changed files: backend catalog/controller/DTO/tests; frontend catalog UI/API client; topic docs; this task file.
- Tests and exact results: focused Jest 2 suites/48 tests passed; final section-specific Jest 5 passed; Nest build passed twice; Angular production build passed (budget/CommonJS warnings).
- Known pre-existing failures: none in focused checks; Angular budget/CommonJS warnings are pre-existing.
- Schema / production / security / accounting / external impact: no schema or production-data mutation; admin-only new internal API; only new SYSTEM expense section rows, no change to posted accounting or report totals.
- Risks and manual checks: verify admin UI creates a section, selects it for a new card, and receives a conflict for an occupied block in dev.
- Documentation updated: backend bookkeeping and frontend booking-account-catalog topic AGENTS.md.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
