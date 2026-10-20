# KT-077 - Issue a document from an income transaction

- Status: `BLOCKED`
- Task manager: unassigned
- Worker: unassigned
- Worktree: not created
- Branch: not created
- Base commit: `d59ee789` (investigation baseline only)
- Blocking condition: finish the active production cutover, then obtain Elazar's
  explicit approval for the product, schema, accounting and reporting decisions
  listed below before dispatching implementation.

## Business outcome

An eligible income row in the transactions/cash-flow table offers an
"Issue document" action. The action opens document creation with trustworthy
transaction details prefilled, lets the user issue only an appropriate receipt
or tax-invoice receipt, and permanently links the issued document to its source
transaction without duplicate documents, income, VAT or journal postings.

## Acceptance criteria

- [ ] The action appears only for eligible positive income rows and only when
      the effective user may issue documents for the associated business.
- [ ] A transaction without an associated account/business cannot issue a
      document until that association is resolved.
- [ ] Opening the action preselects the issuing business and prefills the
      approved receipt date, amount and currency from a server-validated
      transaction snapshot; the frontend row is never the authoritative source.
- [ ] The payer/merchant name is a recipient suggestion only. The user must
      confirm an existing client or create/enter the correct recipient.
- [ ] The document line description and payment method remain explicit user
      confirmations unless the source data supports an approved deterministic
      rule.
- [ ] Exempt businesses can issue a receipt only. VAT-liable businesses can
      issue a receipt only against an already-issued invoice; otherwise they
      issue a tax-invoice receipt. The rule covers all relevant business types,
      not only the `LICENSED` enum value.
- [ ] Prefilling a tax-invoice receipt treats the bank receipt as the gross
      amount and produces document totals that reconcile exactly, without
      adding VAT twice.
- [ ] The existing SHAAM allocation flow, including mandatory and voluntary
      allocation behavior, remains active for prefilled tax-invoice receipts.
- [ ] The source relationship is durable across navigation, refreshes and the
      nightly full-transaction-cache cleanup. It does not rely on a cache row
      primary key or browser navigation state.
- [ ] Issuance persists the source link atomically with the official document
      and its journal entry. Failure leaves no partial document, link, counter
      reservation or journal posting.
- [ ] Concurrent requests and repeated clicks cannot allocate the same source
      amount twice. The server enforces ownership, business scope, remaining
      amount and idempotency.
- [ ] A linked transaction is excluded from any later path that would create a
      duplicate income or journal posting. Reports and review screens use the
      same source-of-truth relationship.
- [ ] After issuance the row exposes the linked document and its truthful state
      (issued, pending allocation, cancelled/credited or handled externally)
      instead of continuing to offer unrestricted issuance.
- [ ] Issued documents remain immutable. Cancellation, refund and correction
      use the existing credit/cancellation flows while preserving link history.
- [ ] Focused frontend and backend tests cover visibility, prefill, business
      scope, permissions, document-type routing, VAT math, idempotency,
      duplicate prevention and failure rollback.
- [ ] Relevant Nest and Angular production builds pass, and the accounting/VAT/
      P&L regression gates show no unexplained difference.

## Product decisions required before approval

1. Clarify whether "business name" means the issuing business or the paying
   customer. The current document form treats these as separate fields.
2. Choose the authoritative receipt date: bank transaction date, value/payment
   date, or a documented fallback rule when one is absent.
3. Decide whether the first release supports partial payments and aggregated
   deposits. Recommended: model allocated amounts from the start even if the
   initial UI permits only one fully allocated transaction.
4. Define the UX for a VAT-liable business: ask whether a tax invoice already
   exists and require selecting it before allowing a receipt.
5. Define "handled externally" behavior for a receipt/invoice issued in another
   system, including any external reference captured and who may set it.
6. Decide whether accountants acting for represented clients may issue official
   documents, and if so under which explicit delegation scope.
7. Define how cancellation, credit, refunds and chargebacks restore or retain an
   allocated source amount.

## Recommended design direction

- Add a dedicated backend prefill/read endpoint keyed by the authenticated user
  and `externalTransactionId`. It resolves current source data, business access,
  eligibility and existing allocations.
- Use router state only to carry the source identifier and improve navigation;
  reload all authoritative prefill data from the backend.
- Persist a source-link entity/table containing at least the owner, external
  transaction ID, document ID, allocated amount, currency and lifecycle state.
  A link table is preferred over a single document ID on the transaction because
  it can represent partial payments and aggregated deposits.
- Key the relationship by durable transaction identity (`userId` plus
  `externalTransactionId`), not `full_transactions_cache.id`, because the cache
  is intentionally cleared and rebuilt.
- Create/validate the link inside the same transaction that creates the document
  and journal entry, with database-backed uniqueness/allocation protection.
- Enrich transaction reads with linked-document state so the shared desktop and
  mobile action resolver renders the same truthful action.
- Integrate the relationship into report/review logic explicitly. The existing
  `ExtractedDocument` matching mechanism covers inbound expense documents and
  is not a substitute for linking an issued income document.

## Edge cases and accounting risks

- A licensed/VAT-liable receipt clears accounts receivable, while a tax-invoice
  receipt recognizes revenue and output VAT. A receipt without a prior invoice
  can therefore create an incorrect receivable balance.
- The bank description is not reliable recipient identity and may describe a
  transfer service, card acquirer or truncated payer name.
- Card-processor settlements may aggregate many customers and deduct fees; bank
  amount and document amount may differ because of fees or withholding tax.
- One invoice may be paid by several transactions, and one transaction may pay
  several invoices.
- Foreign-currency rows contain original-currency and ILS amounts; the issued
  currency and reconciliation rule must be explicit.
- Reversals, refunds, chargebacks, duplicate provider rows and pending bank
  entries are not ordinary receipts.
- Existing drafts are currently scoped by business and document type; launching
  different source transactions must not overwrite or silently restore an
  unrelated draft.
- A document already issued in another system must not be recreated merely
  because no local source link exists.
- Allocation-number requirements and thresholds are date-sensitive and must use
  the existing centralized SHAAM decision flow rather than new hardcoded values.
- Double-click prevention in the UI is insufficient; the backend must handle
  races and retries safely.

## Scope and constraints

- In scope: transaction-row action and state; server-validated prefill;
  receipt/tax-invoice-receipt routing; durable transaction-to-issued-document
  relationship; idempotency; journal/report/review integration; focused tests;
  schema/cutover documentation; nearest topic documentation.
- Out of scope unless separately approved: automatic bulk issuance, OCR of
  income documents, bank reconciliation beyond the source link, changing
  document numbering, changing VAT/accounting policy, production deployment or
  live production data changes.
- Required reading: root `AGENTS.md`; `docs/coordination/WORKFLOW.md`;
  `docs/redesign/categories-redesign-master-plan.md`; transaction, document,
  bookkeeping, report and generic-table topic `AGENTS.md` files; current SHAAM
  allocation task/documentation.
- Approval boundaries: schema/cutover SQL, journal behavior, report-total
  behavior, delegation authorization and any production action require explicit
  approval. A frontend-only prefill is not an acceptable reduced scope because
  it leaves duplicate-document and duplicate-accounting risks unresolved.
- Timing: do not modify the active cutover while production cutover Steps 2-6
  are in progress. Re-plan this task after cutover state is confirmed.

## Expected affected areas

- `frontend/src/app/pages/transactions/`
- `frontend/src/app/pages/doc-create/`
- `frontend/src/app/components/generic-table/` only if the existing action
  contract proves insufficient
- `backend/src/transactions/`
- `backend/src/documents/`
- `backend/src/reports/` and/or report-review matching
- `backend/src/bookkeeping/` where journal duplicate prevention requires it
- `docs/redesign/cutover.sql` or the post-cutover schema-change mechanism then
  in force
- nearest topic `AGENTS.md` files

## Handoff

- Result: investigation summarized; implementation intentionally not started.
- Commit hash(es):
- Changed files: this task record only.
- Tests and exact results: documentation-only validation required for this task
  record; application tests/builds are not applicable.
- Known pre-existing failures: none evaluated.
- Schema / production / security / accounting / external impact: the future
  implementation is expected to affect schema, document authorization,
  accounting journals and reports; no such behavior is changed by this record.
- Risks and manual checks: captured above; revalidate against post-cutover code
  and current Tax Authority requirements before approval.
- Documentation updated: this task record.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions: none; this is a deferred task definition.
