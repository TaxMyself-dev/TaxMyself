# Admin refunds — dev implementation

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
