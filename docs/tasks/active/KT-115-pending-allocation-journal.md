# KT-115 - Pending allocation accounting and completion flow

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt115-worker`
- Branch: `codex/kt-115-pending-allocation-journal`
- Base commit: `17d985d489c04ced4379d142eaa7e8a3e2cc5370`

## Business outcome

A required-allocation invoice can be recorded immediately in accounting and
reports while PDF issuance waits for its allocation number. From the issued
documents table, one allocation action offers either automatic Tax Authority
allocation or the existing manual details-and-entry flow.

## Acceptance criteria

- [x] The create-document decision labels the deferred action "הפק מספר הקצאה מאוחר יותר" rather than cancellation.
- [x] Deferring persists the final numbered `PENDING_ALLOCATION` document and creates its journal entry atomically, but creates no PDF.
- [x] Completing a pending document reuses an existing journal entry and never posts a duplicate; legacy pending documents without a journal still receive one on completion.
- [x] The pending-document allocation action opens one popup with automatic and manual choices.
- [x] Automatic allocation uses the existing durable SHAAM flow when connected and offers navigation to the existing connection screen when not connected.
- [x] Manual allocation opens the existing invoice-details dialog, Tax Authority link, and allocation-number field.
- [x] Focused backend/frontend tests and both production builds pass.

## Scope and constraints

- In scope: documents pending-allocation journal timing; doc-create decision wording; incomes allocation-choice orchestration; focused tests and topic docs.
- Out of scope: schema/data migration, allocation thresholds, SHAAM API contracts, production access/deployment, retroactive journal backfill for already-pending rows.
- Required reading: root `AGENTS.md`; coordination workflow/authority/quality/lessons; categories audit and master plan; documents, SHAAM, doc-create, and bookkeeping topic docs.
- Approval boundaries: preserve allocation state-machine safety, report calculations, account mappings, authorization and external contracts.

## Handoff

- Result: complete
- Commit hash(es): this task commit
- Changed files: document issuance/finalization service and focused tests;
  doc-create deferred-action wording/orchestration; incomes allocation-choice
  UI/orchestration/tests; focused frontend test config; topic docs and this task.
- Tests and exact results:
  - Backend focused Jest: 1 suite, 3 tests passed.
  - Frontend allocation/table focused Karma: 17 tests passed.
  - Frontend doc-create focused Karma: 27 tests passed.
  - Nest build: passed, exit 0.
  - Angular production build: passed, exit 0, with existing budget/CommonJS warnings.
- Known pre-existing failures: default ChromeHeadless failed before test execution
  because its GPU process crashed; the same selections passed with temporary
  no-sandbox/disable-gpu launcher flags, and the temporary config was removed.
- Schema / production / security / accounting / external impact: no schema,
  production data, authorization, or SHAAM API-contract change. Accounting
  timing changes as approved: current pending invoices post exactly one journal
  entry at initial persistence and therefore enter journal-backed reports before
  PDF completion. No external SHAAM call was made.
- Risks and manual checks: existing pending rows are not backfilled; if they lack
  a journal, finalization creates it through the preserved compatibility path.
  Manually verify both allocation choices and Settings navigation in the UI.
- Documentation updated: backend documents, frontend doc-create, frontend
  bookkeeping, and this task record.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
