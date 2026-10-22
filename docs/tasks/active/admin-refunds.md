# Admin refunds

- Status: `WORKER_COMPLETE` (local feature delivery; dev only)
- Task manager: Codex
- Worktree: C:\Users\user\Keepintax\TaxMyself-admin-refunds
- Branch: codex/admin-refunds
- Base commit: 09beebab9181d23b47ef449a801fc6279c701120

## Business outcome
Admin can refund a captured customer payment from Cardcom/subscriptions without changing subscription state. A signed credit document is issued and emailed; user history shows a negative amount.

## Acceptance criteria
- [x] Admin refund action opens accessible RTL dialog with original payment, amount and reason.
- [x] Server validates owner/payment and remaining refundable balance under locks.
- [x] Durable idempotent reservation precedes provider I/O; unknown outcomes never replay automatically.
- [x] Recovery completes verified refund document/PDF/email without another refund.
- [x] User history includes successful refunds as negative rows with download.
- [x] Focused concurrency/failure/auth tests and backend/frontend builds pass.
- [x] Subscription dates, debt satisfaction and entitlement remain unchanged.
- [x] Legacy payment without billing_attempt, including missing event VAT breakdown,
  uses its original receipt and transaction id. Credit document plus negative
  downloadable history are tested. Historical 17% VAT is retained.

## Scope and constraints
No live provider requests, production DB access, production changes or deployment.
Elazar approved the shared-table schema on 2026-10-21: operation/source/request/
actor/reason fields on billing_attempt and refund events/generated success key
on billing_event; existing UNIQUE document attempt provenance is reused. No new
tables. MySQL compatibility requires equivalent BEFORE triggers for invariants
on cascading-FK columns and a virtual generated event key. Applied only to
keepintax-dev through a hard-allowlisted standalone runner; no Nest boot/sync.
Source main was fast-forwarded under explicit permission while leaving the
untracked app-mapping folder untouched. Feature branch fast-forwarded to same base.

## Handoff

Follow-up requested by Elazar after the first real dev request: persist/display
provider error descriptions and add computerized lookup evidence. Implemented
without schema changes: sanitized descriptions are in existing refund audit
metadata; admin-only check-provider reads ListTransactions and returns candidates
matched by original UID/terminal/currency/amount, never financial-state writes.
Legacy attempt #10's lost description is not fabricated or recovered via another
refund request. All live account/provider checks remain user-triggered in the UI.
Follow-up validation: 22 backend tests across refund service, provider adapter
and admin authorization passed; 7 frontend refund tests passed in ChromeHeadless.
Backend and frontend builds passed (frontend reports budget/CommonJS warnings).
No account lookup, money operation, schema change or existing refund-state change
was performed by these mocked tests. git diff --check passed.
- Result: complete, local dev feature branch only; not integrated/pushed/deployed.
- Commit: see this task's local feature commit (includes this record).
- Tests:
  - Backend: npm test -- --runInBand --silent billing documents-journal.service.spec:
    35 suites / 487 tests passed. After final history-before-document/VAT-rounding
    refinements, focused refund/reconciliation/auth/adapter rerun: 4 suites / 31 passed.
  - Backend npm run build: passed.
  - Frontend npm run build: passed; budget/CommonJS warnings in the existing app.
  - Frontend ChromeHeadless subscription/refund tests using
    tsconfig.billing-resolution.spec.json: 13 passed, including rendered dialog.
  - Dev schema runner after application: 0 pending statements; 5 attempts and
    74 events retained. Rollback-only schema checks: 9 passed; same counts afterward.
  - git diff --check: passed.
- Known pre-existing failures: none asserted; initial changed-code fixture
  failures were corrected and rerun successfully.
- External test limits: CardCom, signing/storage and mail mocked. No real refund,
  live signed PDF or real email was issued. No existing dev business data rewritten.
- Risks: unknown refund outcomes require documented operator verification;
  provider's ExternalRefundDealId has no documented exactly-once promise.
  Existing mail crash-window semantics can duplicate an email, never funds/documents.
- Schema/accounting/security impact: approved dev-only additive schema plus nullable
  charge-only fields and invariant triggers. Existing credit-note journal rules,
  document numbering and admin actor authorization reused; no entitlement/debt change.
- Documentation: docs/features/admin-refunds.md; nearest billing/documents/admin
  topic instructions; commented dev-only cumulative DDL in docs/redesign/cutover.sql.
# Follow-up 2026-10-22: document completion diagnostics

Requested by Elazar: save and display errors from successful refunds whose credit
PDF/email completion fails. Added stage/message/time audit metadata and admin
display, retaining CAPTURED recovery and no-repeat-money behavior. No schema or
production changes; no live provider operation or manual financial-state update.
Focused tests cover persisted PDF and email failure, sanitization, reload,
successful recovery hiding the old error, and rendered admin error/retry UI.
Validation: 14 backend refund tests and 8 isolated ChromeHeadless dialog tests
passed; Nest and Angular production builds passed. Initial frontend invocation
omitted Angular's include filter and failed test discovery; corrected isolated
invocation passed. git diff --check passed. Local port 4200 serves completionError
and completionStages; backend compiled output includes the new diagnostic.
