# Admin refunds — dev implementation

User settings / My Subscription history offers both document preview (separate
tab) and download for charge and negative refund rows. Both use the existing
authenticated owner-scoped receipt endpoint. Missing PDFs show an error; these
actions do not generate documents or submit refunds.

Production SQL and operator instructions are prepared **for approval only** in
[admin-refunds-release.md](admin-refunds-release.md). The feature branch was
rebased on fetched origin/main 4dc1306d on 2026-10-22; main remains unchanged.
This does not authorize production access, merge, push or deployment.

## Scope and approvals

Elazar approved reuse of billing tables and the explicit schema proposal on
2026-10-21. Development/database changes only. No production access, real CardCom
refunds, live signing/mail calls, deployment or integration into main as part of
this delivery. main and origin/main were verified at
09beebab9181d23b47ef449a801fc6279c701120 before feature edits; the existing
untracked main/app-mapping folder was left untouched under explicit approval.

## Flow

The Cardcom/subscriptions row menu exposes זיכוי for every subscription, including
currently complimentary/canceled subscriptions with historical payments. The RTL
dialog lists original successful payment/renewal events, refundable balances,
reason/amount/confirmation, and refund history/recovery controls.

A request UUID and original payment event identify an operation. The subscription
row lock serializes balance reservations, including different admins/request ids.
Duplicate historical events for the same CardCom transaction use the oldest event
as their single source. A different unfinished refund on that payment blocks a
new reservation. Completed and uncertain refunds consume balance; only a documented
final no-refund decision releases it. Different completed partial refunds are allowed.

The reservation and REFUND_REQUESTED audit commit before provider I/O. The adapter
uses official v11 Transactions/RefundByTransactionId with PartialSum in NIS,
CancelOnly=false, AllowMultipleRefunds=true and ExternalRefundDealId as correlation.
It never treats that last field as a documented idempotency guarantee and makes
no network retries. A success with NewTranzactionId becomes CAPTURED. Transport
errors/malformed responses/nonzero codes become UNKNOWN and never cause replay.
An interrupted PROCESSING lease expires into UNKNOWN.

The separate refund finalizer reuses the UNIQUE documents.billing_attempt_id and
existing credit-note numbering/document/journal transaction. Parent type/number,
recipient, VAT rate and amounts originate from the source receipt. Partial refunds
allocate frozen original net/VAT cumulatively so the last refund has exact totals.
No plan pricing, entitlement, period, next billing date, debt or satisfied pointer
is modified. Source documents must be the company issuer's ILS TAX_INVOICE_RECEIPT
with totals matching the original payment; missing/inconsistent data fails closed.

After a confirmed refund, REFUND_SUCCESS records negative net/VAT/gross in the
existing history and links its credit document. Until signed files exist the history
does not claim a downloadable document. Existing signing/upload/mail paths are used
with the credit-note email title. Post-refund failures leave CAPTURED; a minute cron
retries document/email completion with bounded exponential backoff and exclusive
leases. Manual COMPLETE uses that path and cannot call the refund endpoint again.

UNKNOWN recovery requires an actual admin actor, current state version, no live
lease, and evidence of a final CardCom determination. CONFIRM_REFUNDED additionally
requires the refund transaction id (distinct from the original charge); this is
explicitly an operator-attested determination, not a claimed automated provider
lookup. Its provider id is unique per terminal. CONFIRM_NOT_REFUNDED releases only
after the operator confirms the original request is definitively not pending.
The dialog labels both actions accordingly. Records and evidence stay auditable.

## Provider diagnostics and read-only check (2026-10-21 follow-up)

Refund responses now append mandatory REFUND_RESOLUTION audit rows with
metadata.kind=PROVIDER_REFUND_RESPONSE, numeric code and a bounded/redacted
Description, atomically with the outcome. Both normal responses and HTTP error
bodies retain only those whitelisted diagnostics; transport exception configs,
credentials, card numbers and tokens are never stored. The admin context/dialog
shows the code and description. Older requests explicitly show that their
description was not saved; it cannot be reconstructed by re-submitting a refund.
No schema change is needed.

POST admin/billing/subscriptions/:id/refunds/:attemptId/check-provider is admin-only
and read-only. It calls official Transactions/ListTransactions (TranStatus=All,
terminal-restricted, paginated and bounded) for the original payment and request
date windows, each expanded by a day to tolerate provider date boundaries. It first
verifies the original id, charge flag, terminal, currency, amount and nonempty Uid.
It then returns only refunds sharing that Uid, terminal, currency and requested
amount. CardCom documents the same Uid for an original transaction and its refund.
The response is a minimal candidate list (id/code/description/date), never tokens,
customer identity or raw transactions. Partial scans are labeled.

Candidates are evidence for the operator, not proof of which request caused the
refund: the documented list response does not expose ExternalRefundDealId, and
multiple partial refunds may have the same amount. The check therefore performs
no status/balance/document writes and never calls RefundByTransactionId. Missing
results never release balance or imply no refund. Existing evidence-based resolve
actions remain the final decision. No live account lookup was performed during
implementation; public spec was read and adapter/service/UI tested with mocks.

The submission endpoint is POST admin/billing/subscriptions/:id/refunds. Its
server-side adapter calls Transactions/RefundByTransactionId synchronously. A
successful direct response (ResponseCode=0 plus NewTranzactionId) confirms the
refund independently of ngrok. LowProfile payment webhooks are a different flow;
the refund request schema has no per-request WebHookUrl field. Uncertain results
remain reserved regardless of whether any external notification later arrives.

Existing mail delivery semantics are retained: a crash after the mail provider
accepts a message but before the sent flag commits can produce a duplicate email;
it cannot produce another refund or credit document. No claim of exactly-once
external mail delivery is made.

## Legacy payments

Source lookup uses billing_event.cardcom_deal_number and receipt_doc_id, not a
source billing_attempt. A legacy event with billing_attempt_id=NULL and missing
event VAT breakdown is supported using its original receipt's validated totals.
Missing CardCom identity/source document is displayed as a blocked payment.

## Schema and dev verification

No new tables or documents columns. billing_attempt adds operation/source/request/
actor/reason and generated provider-refund uniqueness; obligation/plan become
nullable for refunds only. Trigger/charge-mode enums append refund values.
billing_event appends four refund audit types and generated unique success identity.
MySQL 8 rejects CHECK clauses on cascading-FK columns (3823), so four BEFORE
INSERT/UPDATE triggers enforce the approved logical constraints. The event success
key is VIRTUAL to preserve the existing cascading provenance FK. Existing amount
checks, document uniqueness and FK actions are retained.

Run from backend (the scripts read only this worktree's ignored .env and refuse
anything except DB_DATABASE=keepintax-dev):

```powershell
node scripts/migrate-admin-refunds.js
node scripts/migrate-admin-refunds.js --apply
node scripts/verify-admin-refunds-schema.js
```

The first command inspects schema only. The migration is resumable per object and
preserves existing ENUM values/order. Row counts were 5 attempts/74 events before
and after application. Constraint verification inserts synthetic rows inside one
transaction, checks UNIQUE/FK/trigger failures, then rolls all rows back. Auto-increment
ids may advance; existing business rows/documents/counters are not modified.
The cumulative SQL contains a commented, dev-only DDL record; production execution
is not authorized. Never start Nest with synchronize to apply this feature: use
the guarded script so trigger enforcement is installed.

## Tests

Refund lifecycle tests exercise the real refund service, real credit-document
payload builder and real user-history mapping over a serialized fake database;
CardCom, createDoc persistence, PDF signing/storage and mail are mocked. They include
legacy events, duplicates, concurrent requests, timeouts, partial VAT rounding,
post-capture PDF failure and retry, stale resolutions, owner/source validation,
interrupted submission and unchanged subscription state. Existing journal tests
cover the credit-note posting path. Separate actual MySQL tests verify constraints.
Frontend isolated tests cover confirmation, exact agorot, click suppression,
retry request identity, invalid balance and completion-only recovery.

Official contract checked: https://secure.cardcom.solutions/swagger/v11/swagger.json
# Completion error diagnostics (dev follow-up, 2026-10-22)

Admin refund history includes view/download credit PDF actions. The authenticated
admin-only GET subscriptions/:id/refunds/:attemptId/document verifies the refund's
source belongs to the selected subscription/user, and the document is that
refund's CREDIT_INVOICE with an available PDF. It streams the existing file
through the backend with no-store caching; no public storage URL is exposed.
Missing PDFs explain that document completion is still needed. Viewing opens
a separate tab; download saves the PDF locally. Neither action creates documents
or refunds.

Document completion failures persist a bounded, redacted message, stage and event
timestamp in existing REFUND_RESOLUTION metadata (REFUND_COMPLETION_FAILED).
Saving this event and releasing the finalization lease/backoff are atomic and
guarded by lease ownership. The admin dialog shows the latest error while the
refund is CAPTURED; successful completion hides it but retains the audit record.
Stages distinguish source validation, credit creation/linking, PDF/sign/upload,
email and final status persistence. Raw exceptions, stacks and HTTP bodies are
not saved. Existing failures cannot be reconstructed; the next completion attempt
records a new diagnostic. No schema changes or additional provider refunds.
