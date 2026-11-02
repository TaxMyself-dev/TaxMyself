# KT-060 - Repeatable uniform-file demo fixture

- Status: `COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\\Users\\harel\\Elazar Harel\\taxmyself\\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: local branch HEAD plus the uncommitted KT-056 through KT-059 work
  (no commit will be created in this task)

## Business outcome

Creating or self-resetting the existing `ledger-test` demo profile produces a
known, repeatable set of real documents, document lines, payments, expenses and
journal entries from which the user can generate a uniform file without manual
data entry.

## Acceptance criteria

- [x] Declare the recommended uniform-file business and cut period on the
      `ledger-test` profile.
- [x] Seed at least one pre-period journal movement for B110 opening balances
      and in-period documents/expenses for B100/B110 movements.
- [x] Seed real document lines and a payment through `DocumentsService.createDoc`
      so C100, D110 and D120 can all be exercised.
- [x] Ensure every in-period C100 document has the D110 and/or D120 details
      required for its document type, with totals that reconcile.
- [x] Make this profile's document/expense fixture strict: a partial seed must
      surface as a failure instead of being logged as a successful demo.
- [x] Seed strict-fixture businesses and their expenses sequentially so
      journal-counter writes cannot deadlock each other during fixture creation.
- [x] Make self-service test reset delete the profile's journal rows and reseed
      the document/expense fixture without duplicating accounting data.
- [x] Add focused tests for the profile shape, strict seeding and reset reseed.
- [x] Update demo-data documentation and run focused Jest plus backend build.

## Scope and constraints

- In scope: existing `ledger-test` profile, demo template types, demo seeding
  and self-reset behavior, tests and docs.
- Out of scope: schema changes, production data, real Tax Authority submission,
  SHAAM OAuth/API calls, frontend changes, commit, push and deployment.
- Demo values are synthetic and fixed for repeatability. The fixture must use
  normal document/expense services rather than direct inserts for accounting
  source rows.

## Handoff

- Result: `ledger-test` is now a repeatable strict uniform-file fixture. Its
  licensed business uses the valid synthetic number `222222226`; January 2026
  feeds B110 opening balances and the recommended `2026-02-01`–`2026-03-31`
  cut contains real documents, expenses, a discounted D110 line and D120
  bank-transfer/cash payments. Every exported invoice/credit has a D110 line,
  and every invoice-receipt/receipt has a D120 payment. Initial seed and self-reset verify persisted source
  and journal counts before reporting success; strict-fixture expense creation
  is sequential across the entire profile to prevent the cross-business
  deadlock observed in the live dev seed attempts.
- Commit hash(es): none requested
- Changed files:
  - `backend/src/demo-data/demo-profile.types.ts`
  - `backend/src/demo-data/profiles/ledger-test.profile.ts`
  - `backend/src/demo-data/demo-data.service.ts`
  - `backend/src/demo-data/demo-data.service.uniform-file.spec.ts`
  - `backend/src/demo-data/AGENTS.md`
  - `docs/tasks/active/KT-060-uniform-file-demo-fixture.md`
- Tests and exact results: focused Jest passed (6 suites, 89 tests, 0 failed);
  after the live D120 regression, an additional focused run passed (4 suites,
  26 tests, 0 failed), including numeric payment-method field 1306. After the
  simulator exposed missing document details, 3 focused suites passed again
  (26 tests, 0 failed), including C100-to-D110/D120 presence and total
  reconciliation; backend Nest build passed; `git diff --check` passed.
- Known pre-existing failures: none encountered in the requested verification.
- Schema / production / security / accounting / external impact: following the
  failed live seeds and explicit user approval, the documented missing dev-only
  columns `expense.activationDate`, `expense.annualReportingYear`,
  `expense.source`, `slim_transactions.annualReportingYear`,
  `full_transactions_cache.annualReportingYear` and `extracted_document.source`
  were added to `keepintax-dev` with their documented backfills; no production,
  authorization, external API or SHAAM calls.
  Demo reset now deletes
  only the authenticated demo user's journal rows and document counters before
  rebuilding source rows through the normal services. The simulator's
  certification-only minimum of 2,000 records remains a separate fixture step;
  it is intentionally not inflated into this small functional demo profile.
- Risks / manual checks: no live dev user was seeded during implementation.
  Because the licensed demo number was corrected to a valid-check-digit value,
  any existing `ledger-test` instance must be fully reset and recreated once
  from the admin screen (self-reset detects an old instance before deleting
  anything). Then generate the recommended cut and inspect the resulting ZIP;
  strict persisted-count checks surface a missing catalog/journal prerequisite
  during the seed itself.
- Documentation updated: demo-data topic map and this task file.

## Integration

- Reviewed by: pending user manual fixture run
- Integrated commit: none requested
- Combined verification: focused Jest and backend build passed locally
- `origin/main` verification: not applicable
- User-visible run instructions: reset then create `ledger-test`, sign in as
  `demo+ledger@keepintax.local`, select business `222222226`, and generate the
  cut `2026-02-01` through `2026-03-31`.
