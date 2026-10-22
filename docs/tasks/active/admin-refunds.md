# Admin refunds

- Status: `WORKER_COMPLETE` (release preparation complete; owner approval pending; no main merge/push/deploy)
- Task manager: Codex
- Worktree: C:\Users\user\Keepintax\TaxMyself-admin-refunds
- Branch: codex/admin-refunds
- Current base commit: 4dc1306d208fe2bed3ab4a7a973701c5f9f7a227
- Original feature base: 09beebab9181d23b47ef449a801fc6279c701120

## Business outcome
Admin can refund a captured customer payment from Cardcom/subscriptions without changing subscription state. A signed credit document is issued and emailed; user history shows a negative amount.

## User history document preview follow-up (2026-10-22)

Owner requested a preview action beside the existing download in the user's
charge/refund history. Added a unified table eye action using the existing
owner-authenticated getReceiptBlob and FilesService.previewFile3, reserving the
tab before async HTTP. Shared busy guard prevents duplicate reads; popup blocking
and missing PDF failures are handled without money/document writes. No backend,
schema, credentials or production change. Release SQL/runbook remain pending
owner approval, with no main merge/push/deploy.
Validation: 10 ChromeHeadless tests across user history document actions, dates
and subscription cancellation passed using tsconfig.billing-history.spec.json.
Initial run found a new test row-id type mismatch; corrected and reran successfully.
Frontend production build passed with existing budget/CommonJS warnings.
git diff --check passed. Browser popup/PDF rendering itself is reused unchanged
from FilesService.previewFile3 and mocked in this focused test run.

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

## Release preparation requested 2026-10-22 (complete, awaiting approval)

Owner explicitly requested: update only the refund feature branch from current
main; rerun verification; prepare production SQL/runbook for approval. No merge
to main, push, production connectivity or deployment. Existing worktree retained.
Fetch found origin/main 4dc1306d208fe2bed3ab4a7a973701c5f9f7a227 (3 SHAAM commits
after the original base). Rebased all 5 local feature commits without conflict;
new feature tip before release docs is 7e5081ec3986b94802bbd080bdc9020404d9ac14.
Local main remains 09beebab9181d23b47ef449a801fc6279c701120; app-mapping untouched.
Standalone preflight/apply/verify SQL and admin-refunds-release.md are review
artifacts only. The draft does not loosen the dev runner's database allowlist.

Integrated verification on the rebased branch (all exit 0):
- Backend `npm test -- --runInBand --silent billing documents-journal.service.spec shaam`:
  45 suites, 556 tests passed (684.767 s); providers mocked, no live operations.
- Backend `npm run build`: passed.
- Frontend `npm exec ng test -- --watch=false --browsers=ChromeHeadless
  --ts-config=tsconfig.billing-resolution.spec.json
  --include=src/app/shared/admin-billing/subscriptions/*.spec.ts
  --include=src/app/pages/billing/billing-recovery.page.spec.ts`: 24 passed.
- SHAAM settings/callback frontend specs from newly integrated main: 8 passed
  using an isolated temporary tsconfig and matching explicit include filters;
  temporary config removed after execution.
- Frontend `npm run build -- --configuration production`: passed; existing
  Angular budget/CommonJS warnings, no compilation failure.
- Existing dev migration inspection: pendingStatements=0 on MySQL 8.0.37-google.
- Real dev constraint checks: 9 passed, syntheticRowsRolledBack=true, attempts=11
  and events=94 unchanged. First connection reset (ECONNRESET); retry passed.
- Static review: all 4 release trigger bodies match approved dev DDL; apply has
  pending approval guard and no business DML/destructive table changes; preflight
  and verify contain only USE/SELECT/SHOW CREATE TABLE; 6 local Markdown links pass.
  These are static checks, NOT execution/syntax rehearsal of the new release SQL.
- Remote refreshed again after tests: origin/main unchanged at 4dc1306d; no
  missing upstream commits (0 behind / 5 feature commits before release docs).

Release risk/manual gate: production baseline and runtime configuration were
not accessed. New one-shot SQL has not been run in any database. Before execution,
the owner/operator must approve the exact files, inspect preflight, rehearse on
an isolated matching schema, take backup and pause all writers. No automatic
schema rollback; backend versions predating refunds are unsafe after REFUND rows
exist. See docs/features/admin-refunds-release.md for the full operator procedure.
No tracked ENV, secrets, dependency changes or generated builds are included.

Additional requested admin credit document access: popup view/download actions
use a Firebase/admin-authorized PDF route with subscription/source ownership and
credit document provenance checks. Existing PDF download service reused; no DB,
schema, provider or accounting mutations. Missing PDFs return a clear UI error.
Validation: 21 backend tests across refund lifecycle and admin controller passed;
9 isolated ChromeHeadless dialog tests passed. Both builds passed (existing Angular
budget/CommonJS warnings). git diff --check passed. Runtime UI smoke lookup on
localhost:4200 was unavailable because no server accepted the connection; real
storage download/browser PDF rendering were not exercised by these mocked tests.

Refund payment options now show `(זוכה: 35 ₪)` next to the original amount when
confirmed refunds exist. Sum only CAPTURED/COMPLETED refunds linked to that
payment; pending/unknown reservations must not be described as refunded money.

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
