# KT-034 - Show pending classified transactions in the archive

- Status: `PUSHED`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `a51b8353ed4863c075943aaadd105dacae2e5516`

## Business outcome

Bank and card transactions classified as recognized expenses appear in the
unified archive while awaiting approval, remain visible independently of the
ephemeral transaction cache, and move to the existing approved-expense view
after approval.

## Acceptance criteria

- [x] Persist the minimal merchant/date/amount/currency display snapshot on
  `slim_transactions` whenever a transaction is classified or rule-backfilled.
- [x] Include recognized, unconfirmed, unmatched slim transactions in the
  unified archive as `TRANSACTION` items with `PENDING` status.
- [x] Do not duplicate transactions already represented by a matched document.
- [x] Preserve tenant/business scope and expose approval actions only to an
  actor with the existing expense-approval capability.
- [x] Approving a pending archive transaction uses the existing transaction
  approval flow, preserves its reporting period, creates the Expense/journal
  atomically, and removes the pending archive row.
- [x] Add the schema change to `docs/redesign/cutover.sql` and update the
  transactions/documents topic documentation.
- [x] Cover snapshot persistence, archive projection, permissions, period
  preservation, and frontend action routing with focused tests; pass backend
  and frontend builds.

## Scope and constraints

- In scope: slim snapshot columns, classification writes, archive API/type/UI,
  pending transaction approval, focused tests, cutover SQL, topic docs.
- Out of scope: changing recognition/accounting rules, immutable history for
  classifications intentionally removed by rule deletion, pagination redesign,
  matching already-approved transactions to later documents.
- Required reading: root instructions, coordination workflow/gates, categories
  redesign master plan, transactions/documents/reports/archive topic docs.
- Approval boundaries: Elazar explicitly approved the `slim_transactions`
  solution after reviewing its schema and lifecycle implications. No production
  execution or deployment is authorized.

## Handoff

- Result: complete
- Commit hash(es): `224013a2`
- Changed files: slim transaction entity/classification pipeline; unified
  archive backend/API/frontend; transaction approval fallback; focused tests;
  cutover SQL; transaction/document/bookkeeping topic docs; redesign worklog.
- Tests and exact results: focused Jest 4 suites / 21 tests passed; Nest build
  exit 0; Angular production build exit 0 with existing budget/CommonJS warnings.
- Known pre-existing failures: none encountered. Initial npm invocation did not
  execute because the sandbox denied the global npm path; direct local Node/Jest
  execution passed.
- Schema / production / security / accounting / external impact: adds five
  nullable snapshot columns and one composite pending-archive index to
  `slim_transactions`; records backfill in cutover SQL. No production command,
  authorization-scope change, accounting-rule change, or external API change.
- Risks and manual checks: legacy pending rows lacking both snapshot and cache
  require one successful bank sync before approval; visually verify represented
  owners see pending rows without approval actions and matched rows are not
  duplicated.
- Documentation updated: transactions, documents and bookkeeping topic docs;
  cutover SQL; redesign worklog; this task file.

## Integration

- Reviewed by: Codex primary manager
- Integrated commit: `224013a2` on local `main`
- Combined verification: focused Jest 4 suites / 21 tests passed; Nest build
  exit 0; Angular production build exit 0 with existing budget/CommonJS warnings.
- `origin/main` verification: pushed through `6e080e71`; remote accepted the
  fast-forward from `a51b8353`.
- User-visible run instructions: apply Section 18 of `docs/redesign/cutover.sql`
  during the governed cutover before deploying this code. No production command
  was run as part of this task.
