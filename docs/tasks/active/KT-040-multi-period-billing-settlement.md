# KT-040 — Accumulated subscription debt, one settlement

- Status: `WORKER_COMPLETE` — local commit only; independent review/integration pending
- Task manager / implementer: Codex
- Worktree: C:/Users/user/.codex/worktrees/billing-debt-recovery/TaxMyself
- Branch: codex/billing-debt-recovery
- Base commit: bba57ef6
- Approval: Elazar selected one link table and explicitly approved local code
  and SQL implementation on 2026-10-05. No database execution, live CardCom,
  push or deployment is authorized. Elazar also approved pricing missing
  periods from the first unpaid obligation's frozen terms; existing amounts
  remain unchanged.

## Confirmed business outcome

Subscription debt accrues for every subscription billing period whose start
has arrived, including periods with no app usage. Periods follow the original
subscription billing anchor, not calendar months. Cancellation stops future
accrual but does not erase accrued unpaid periods. Settlement collects the
whole outstanding balance in one hosted CardCom payment and issues one
existing billing invoice/receipt with one line per subscription period.
The verified payment card is saved for future subscription charges.

Example: anchor 15; no payments for periods starting September 15, October 15
and November 15. Settlement on November 20 pays all three periods with one
charge and one document, with three lines. The next due date is December 15,
not December 20. A period that has not started is not prepaid by recovery.

## Findings on the reviewed base

- billing_obligation already represents one immutable period debt.
- billing_attempt currently has exactly one non-null obligation_id.
- The UNIQUE obligation active/satisfied attempt pointers and UNIQUE receipt
  provenance cannot represent one attempt settling multiple obligations by
  pointing all of them at that attempt.
- Hosted completion currently resets period start to capturedAt and the next
  billing date to one month later. Batch recovery must preserve the anchor.
- Pricing reads the current plan price, business type and discount fields;
  existing debt amounts are frozen but there is no full historical tariff log.
- No cancellation write endpoint was found in BillingService/controller or
  AdminBillingService/controller during this investigation. Existing status
  fields/access semantics are not a complete cancellation flow.

## Implemented schema design (DDL not executed)

1. Add only billing_attempt_obligation: attempt_id and obligation_id, foreign
   keys with restricted deletion, UNIQUE(attempt_id, obligation_id), and an
   index for obligation-to-attempt lookup. Freeze membership before provider
   I/O and retain it for unsuccessful attempts as well as successful ones.
2. Keep period dates, plan and immutable amounts in existing obligations.
   Attempt totals must equal the sum of all linked obligations; no duplicate
   monetary snapshots are needed in the link table.
3. Backfill links from existing billing_attempt.obligation_id. Retain the
   legacy field non-null as the primary debt for existing owner routing and
   numbering. Aggregate attempts select one of their members as that primary
   debt; the link table is their complete membership. Keep the existing unique
   (primary obligation, attempt number) numbering and provider keys.
4. Replace UNIQUE active/satisfied attempt indexes on billing_obligation with
   non-unique indexes while preserving foreign keys. Several debts can point
   at the same attempt; each debt still has at most one active and one satisfied
   pointer. Reserve all linked obligations under subscription and sorted debt
   locks, rejecting unresolved reservations and mismatched ownership.
5. Keep provider identifiers, state machine, leases and one-document provenance.
   Each paid debt reaches the same invoice via its satisfied attempt.
6. No separate settlement tables or settlement-specific subscription/event
   fields. Each permitted retry gets a new attempt and its own frozen links.

Approved DDL is written in docs/redesign/cutover.sql Section 20 (formerly 18,
renumbered during the approved KT-042 main refresh). Do not
execute it, use synchronize, connect to shared/live databases, push or deploy.
DDL approval here is distinct from approval to run it on a named database.

## Runtime boundaries and acceptance criteria

- [x] Materialize due periods idempotently, without dependency on app usage.
      A bounded local accrual sweep may create debts but must not charge a
      PAST_DUE/canceled subscription automatically.
- [x] Generate anchor-preserving month boundaries, including 29/30/31, short
      months, leap years and Asia/Jerusalem. Do not guess a missing historical
      anchor when original records cannot establish it.
- [x] Stop accrual at cancellation. Periods that already started retain their
      debt; no new period starts on/after effective cancellation. Preserve
      existing full-period pricing; no silent prorating or debt deletion.
- [x] Expose canceled-subscription debt settlement without automatically
      reactivating that canceled subscription; restarting is a separate action.
- [x] Before submission, lock subscription then sorted obligations, reject
      UNKNOWN/PROCESSING/CAPTURED/MANUAL_REVIEW or other open reservations,
      freeze membership/totals, and commit before provider I/O.
- [x] One successful provider charge, one verified token update, one document
      with multiple period lines. Document/journal totals match the charged
      net/VAT/gross amounts; preserve numbering and existing document type.
- [x] COMPLETE the attempt and satisfy all linked debts atomically
      only after document completion. CAPTURED retries resume locally with no
      extra charge or document. UNKNOWN is lookup-only and never replayed.
- [x] If another billing boundary arrives during checkout, the frozen payment
      still covers only its original items. A newly due period remains visible
      as debt; do not imply the whole balance is paid or reset the anchor.
- [x] Recovery preview shows each period and amount, one total, and explicit
      card-saving disclosure. Paid periods cannot be included again.
- [x] Focused concurrency, cancellation, calendar, partial-finalization,
      duplicate callback, totals/document-line and frontend tests; both builds.

## Pricing evidence and stop condition

Already-materialized obligations retain their immutable amounts. Elazar
approved missing accumulated periods using the first unpaid obligation's
frozen net/VAT/gross, currency and plan. Do not apply today's price/discount.
If no original unpaid price snapshot, billing anchor, period, or cancellation
timestamp can be established, stop for review without provider I/O. No tax/VAT policy change is
authorized by this task; ambiguous tax treatment must be surfaced separately.

## Delivery order

1. Schema and missing-period pricing decisions approved; database execution remains separate.
2. Implement/test accrual and cancellation boundaries without provider calls.
3. Implement/test basket reservation and one canonical payment attempt.
4. Implement/test one multi-line billing document and local finalization.
5. Connect customer preview/checkout/result and run combined verification.
6. Commit locally and obtain independent review before any integration.

## Handoff

- Result: Local implementation complete; database schema unchanged.
- Schema code/SQL approval: granted; database execution approval: not granted.
- Production/database/CardCom actions: none.
- Verification: all 25 focused backend suites / 316 tests passed, including
  multi-period documents; frontend recovery 4/4 passed; backend and frontend
  production builds passed. Frontend retains existing CSS/initial budget and
  CommonJS warnings. git diff --check passed.
- A broad run also found unrelated failures: legacy catalog-context assertions,
  UsersService/ReportsService fixture DI, and sandbox-generated-directory
  permission errors. The three legacy suites were reproduced (5 failures / 8
  passes); their sources/specs are identical to base bba57ef6. Focused billing
  checks are green; the repository-wide suite is not claimed green.
- No database migration rehearsal, real CardCom payment or full E2E was run.
  Runtime testing requires separately approved schema setup on a named DB;
  do not start the backend against shared data or enable synchronize.
- Missing original evidence stops for review; no new cancellation endpoint,
  historical first-purchase migration, manual resolution or token persistence
  guarantee is introduced. Card storage retains existing best-effort behavior.
- Automatic approval review rejected removal of subscription date validation
  in hosted completion. That validation remains intact.
