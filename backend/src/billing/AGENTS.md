## Purpose
Subscription billing: plan catalog, trial/subscription lifecycle, CardCom payment integration (checkout + webhook-driven activation), recurring renewals, receipts, and an admin back-office for plans/subscriptions.

## Key entities/files
- `entities/subscription-plan.entity.ts` — `SubscriptionPlan`: slug, pricing (agorot), included `modules` (ModuleName[]), trial days, active/public/display flags.
- `entities/subscription.entity.ts` — `Subscription`: one per user (unique on firebaseId), status, trial/period/billing dates, renewal attempts, per-subscription discount.
- `entities/payment-method.entity.ts` — `PaymentMethod`: stored CardCom token + card display info.
- `entities/billing-event.entity.ts` — `BillingEvent`: append-only audit trail (checkout/payment/renewal events), amounts incl. VAT breakdown, links to a generated receipt document.
- `entities/billing-obligation.entity.ts` — durable canonical debt for one subscription service period; owns unique active-attempt and satisfied-attempt pointers.
- `entities/billing-attempt.entity.ts` — one concrete provider charge attempt for an obligation, including immutable CardCom `ExternalUniqTranId` and reconciliation state.
- `entities/payment-method-update-attempt.entity.ts` — independent CreateTokenOnly lifecycle keyed by LowProfileId/opaque public token; never stores CVV or the token itself.
- `entities/cardcom-webhook-log.entity.ts` — `CardcomWebhookLog`: idempotency-keyed log of every inbound CardCom webhook call.
- `services/billing.service.ts`, `pricing.service.ts`, `cardcom.service.ts`, `cardcom-webhook.service.ts`, `billing-event.service.ts`, `billing-receipt.service.ts`, `subscription-access.service.ts`, `subscription-renewal.service.ts`, `admin-billing.service.ts` — plan pricing/checkout, CardCom API calls, webhook processing, receipt generation, module-access checks (`SubscriptionGuard`), daily renewal batch, admin CRUD.
- `billing.controller.ts` (`/billing`), `admin-billing.controller.ts` (`/admin/billing`, admin-only), `cardcom-webhook.controller.ts` (`/billing/cardcom/webhook`, unauthenticated, always returns 200).

## Main flows

### Persistence foundation (KT-032)

The three new aggregate tables are registered with TypeORM but are not wired
into the live checkout, renewal, recovery, webhook, or card-update services yet.
Until that migration lands, the current runtime behavior below is unchanged.

- One `billing_obligation` is canonical for an internal
  subscription/period-start identity. Recovery of that period reuses it; it
  does not create a second debt. `period_start` is inclusive and `period_end`
  is exclusive. `subscription.billing_anchor_day` preserves the original 1-31
  anchor across short months.
- One unresolved `billing_attempt` per obligation is represented by the
  obligation's nullable UNIQUE `active_attempt_id`; `satisfied_attempt_id` is
  separately nullable and UNIQUE. MySQL's multiple-NULL UNIQUE behavior is
  intentional: unrelated open/terminal obligations need not occupy a slot.
- Only final `DECLINED`, `CANCELED`, or `EXPIRED` attempts may clear the active
  pointer and permit a new attempt. `AWAITING_CUSTOMER`, `PROCESSING`,
  `UNKNOWN`, `CAPTURED`, and `MANUAL_REVIEW` remain blocking; `COMPLETED` must
  atomically pair with a `SATISFIED` obligation and can never reopen it.
- `cardcom_external_uniq_tran_id` is opaque, immutable after creation, at most
  25 characters, and globally unique locally. Technical retry/reconciliation
  reuses it; only a new attempt after definite `DECLINED` gets a new value.
- `UNKNOWN` is resolved only through read-only reconciliation; it is never a
  signal to replay a charge. `CAPTURED` means provider success before atomic
  local finalization; only `COMPLETED` is locally complete.
- Payment-method changes use their own aggregate. The subscription's nullable
  active-attempt pointer identifies the latest flow; an older callback marked
  `SUPERSEDED` cannot replace the saved card. The resulting `payment_method`
  and `documents` receipt both carry unique provenance links back to attempts.
- `billing_event` has nullable correlation FKs to these aggregates but remains
  audit/history only, never the coordination source of truth.
- Every future billing mutation is owner-only: the authenticated actor must be
  the subscription subject. Delegated accountants, admin impersonation,
  represented-subject mode, and any `actor != subject` context may retain
  separately authorized read/support visibility but must be rejected
  server-side for payment-method changes, recovery/charge, renewal/reactivation,
  plan/subscription changes, and every other money-moving mutation. Frontend
  hiding is never authorization. KT-032 records this runtime invariant but does
  not change controllers or guards.
- Receipt PDF generation and email delivery remain in the existing manual
  recovery flow and are deliberately outside these persistence state machines.
- Production DDL is additive and lives in `docs/redesign/cutover.sql` Section
  17. It must not be run automatically or against production by application
  startup.

### Obligation/attempt coordination core (KT-035)

- `BillingAttemptOrchestrationService` is the provider-free transaction
  boundary. It locks the subscription and canonical obligation before opening
  an attempt. Network calls must happen only after its short lease transaction
  commits; normalized outcomes are applied in a separate transaction.
- The canonical obligation identity is `subscription + period_start`.
  Concurrent creators recover the unique-key winner and validate its immutable
  plan, period and amount snapshot before proceeding.
- A token charge attempt never trusts a caller-supplied payment-method id. While
  holding the subscription row lock, orchestration derives the id from the
  subscription, locks that payment-method row, and verifies the same owner;
  mismatched or cross-tenant ids are rejected before any attempt is persisted.
  Hosted attempts persist no stored payment-method id.
- A repeated open request returns the existing blocking attempt. It never
  allocates a second provider key while an attempt is `CREATED`,
  `AWAITING_CUSTOMER`, `PROCESSING`, `UNKNOWN`, `CAPTURED`, `COMPLETED`, or
  `MANUAL_REVIEW`.
- Submission/reconciliation leases use `state_version` as a compare-and-swap
  token. An expired `PROCESSING` lease becomes `UNKNOWN`; it is never replayed.
  Reconciliation is scheduled at 1 minute, 5 minutes, 30 minutes, 2 hours and
  24 hours, then escalates to `MANUAL_REVIEW`.
- Only a definite `DECLINED` outcome clears `active_attempt_id`. `CAPTURED`
  remains blocking until a later task atomically completes the receipt/journal
  and marks both attempt and obligation complete.
- The reusable owner-mutation contract rejects missing/mismatched actors,
  delegated access, admin impersonation and represented-subject mode. Future
  controllers must construct this context only from server-verified request
  identity; client flags are never authoritative.

### Canonical lifecycle coordination (KT-038)

`BillingLifecycleService` is the renewal/recovery boundary. Both renewal and
`PAST_DUE` recovery open a `RECURRING_PERIOD` obligation keyed by
subscription + period start; recovery therefore reuses the same debt rather
than creating a parallel charge. Provider I/O is delegated to the provider
runtime after its committed lease. A captured attempt remains blocking until
`finalizeCapturedAttempt` receives a successfully created receipt document;
that method atomically pairs `COMPLETED` with `SATISFIED`. Owner-only actor
context is checked before each mutation. Unknown outcomes are not replayed.

Post-capture recovery: an attempt already `CAPTURED` is never claimed for
submission or sent to CardCom again — `executeRenewal` detects it (from the
period snapshot or the opened attempt) before any provider call and only
resumes the receipt/journal/completion phase through
`BillingLifecycleService.resumeCapturedAttempt`, the single path used by the
first run and every retry. It takes an exclusive finalization lease
(`claimForFinalization`, owner-checked, independent of the owner label), keeps
the attempt `CAPTURED` with its original provider transaction id when any step
fails (lease released, sanitized `RECEIPT_FAILED` event with a failure
category only), and writes `COMPLETED`/`SATISFIED` only after the receipt step
succeeds. Idempotency lives in `BillingReceiptService.ensureReceiptForCapturedAttempt`:
one success event per attempt (`billing_event.billing_attempt_id`), one receipt
document + journal entry per attempt (the existing UNIQUE
`documents.billing_attempt_id`, populated by `createBillingSystemReceipt`;
`createDoc` writes document and journal in one transaction), PDFs and email at
most once. Renewal advances `nextBillingDate` with a compare-and-set, treats a
finalized period as a no-op, and reuses the captured debt snapshot instead of a
re-derived price. A duplicate hosted webhook for a `CAPTURED` attempt resumes
the same phase once the subscription is activated; a `PAST_DUE` checkout never
opens another hosted payment for a `CAPTURED` attempt. `UNKNOWN` and expired
`PROCESSING` reconciliation is described under "Read-only reconciliation".

Hosted activation and event-link recovery (KT-038 Task 3B):
`BillingHostedCompletionService` owns local completion of a hosted attempt whose
capture is confirmed, in this order — subscription activation, receipt/journal,
success-event link, attempt/obligation completion — through
`resumeCapturedAttempt`'s `activate` step. Activation applies the same fields
as the webhook (status, plan, period from `capturedAt`, next billing date,
cleared grace/cancel/end) under a subscription row lock: `ACTIVE` is a no-op,
only `PAST_DUE` is activated, any other state fails for manual review and is
never overwritten. Card-token recovery (Task 5A1, best-effort): `createCheckout`
records the LowProfile id on the canonical PAST_DUE attempt
(`recordHostedLowProfileId`, never overwrites an existing id). When a recovery
activates a PAST_DUE subscription it makes one lookup-only
`CardcomService.getLowProfileResult` call (never a checkout or charge) and
accepts the card only if LowProfileId, transaction id, captured amount and the
ReturnValue owner/subscription/plan/attempt all match the captured attempt. The
token is stored encrypted (existing util) with last four/brand/expiry after
activation, under the subscription lock, and is discarded if the payment method
was updated at/after the attempt opened. A missing id/token, lookup failure,
mismatch or malformed result never blocks activation, receipt or completion: it
records `cardTokenStored: false` with a sanitized `tokenRecoveryReason`. The
lookup runs once, at activation. Crash window (Task 5A2): a hosted attempt still
`CAPTURED` whose subscription is already ACTIVE (the run crashed after
activating) gets one lookup-only token recovery, after the same 2-minute
grace, when no `SUBSCRIPTION_ACTIVATED` event for the attempt records
`cardTokenStored: true` (the webhook's event now carries the attempt id and that
flag); same validation, encryption and newer-payment-method protection, never
blocks the receipt, and a stored token is never looked up or stored again.
Limitation: only canonical hosted attempts that already exist are covered
(first-time/upgrade checkout does not create attempts yet). A recovery activation waits 2 minutes after capture
so a concurrent duplicate delivery cannot activate before the original request
stores the token. `updatePaymentEventWithReceipt` now returns a result;
`ensureReceiptForCapturedAttempt` requires both the success event and the link
and keeps the attempt `CAPTURED` when either fails, so a retry re-finds the
receipt by attempt and only repeats the link. A post-capture failure is
recorded once per attempt (`logReceiptFailureOncePerAttempt`), not per retry.
The reliable local caller is `SubscriptionRenewalService.processDueRenewals`
(the 03:00 cron and the admin manual trigger), which sweeps hosted attempts
still `CAPTURED` after 5 minutes; a replayed webhook uses the same service.
Recovery/reconciliation sweep errors and receipt-event link failures redact
credential-like values and card-number-like digit runs from both the log
message and stack trace before logging.
Production use depends on the approved KT-032 cutover schema (notably the
UNIQUE `documents.billing_attempt_id`, and the `billing_attempt` /
`billing_obligation` tables and `billing_event.billing_attempt_id`) being
present; nothing here runs cutover SQL.
Renewal decline policy (KT-038 Task 4B): the canonical renewal path applies the
original bounded policy (`domain/billing-renewal-policy.ts`, the same values the
legacy implementation and `docs/features/billing/cardcom-billing.md` describe).
It applies ONLY after a definitive provider decline (`DECLINED`) of a
`RENEWAL` / `TOKEN_TRANSACTION` attempt: 3 charge attempts per cycle; the 1st
decline schedules a retry in 3 days, the 2nd in 7 days, and the 3rd moves the
subscription to `PAST_DUE` with a 14-day grace period. `UNKNOWN`, timeouts,
transport errors, malformed/incomplete responses, expired `PROCESSING` leases
and `MANUAL_REVIEW` never enter it and are never replayed.
- State: `subscription.renewalAttempts` is the counter and the retry date is
  stored in `subscription.nextBillingDate` — the field the 03:00 cron selects on
  and the ACTIVE access-grace check reads, so a pending retry is not selected
  before its date and access does not lapse mid-retry. A successful renewal
  resets `renewalAttempts` and `gracePeriodEndsAt`. Once `PAST_DUE` the cron
  never charges again; only the hosted recovery checkout can collect.
- Atomicity: `applyNormalizedOutcome(..., { renewalDeclinePolicy: true })` (passed
  by the provider runtime only for a token-renewal `DECLINED`) locks the
  subscription FIRST (same order as `createOrGetAttempt`), then writes the
  `DECLINED` attempt, clears the obligation's active pointer and applies the
  retry/`PAST_DUE` update in one transaction. It never rewrites a subscription
  that is not `ACTIVE` (for example `CANCELED`) or that is collecting another
  period.
- Same obligation: while a retry is pending `nextBillingDate` holds the retry
  date but `currentPeriodEnd` still holds the original due date;
  `renewalPeriodStart` derives the period being collected from it, so every
  retry reuses the same `subscription + period_start` obligation, its immutable
  debt snapshot (a retry is never re-priced) and gets a new attempt number and
  provider key. A successful retry advances the period once, from the original
  due date, with a compare-and-set on the `nextBillingDate` it read.
- Gate: `executeRenewal` opens attempts with `enforceRenewalSchedule`, which
  re-checks under the subscription row lock that the subscription is `ACTIVE`,
  its due date has arrived and the period matches; otherwise
  `BillingRenewalDeferredError` is raised and the run is a skip — no provider
  call, nothing persisted. A stale cron read therefore cannot consume a retry.
- Known limits (unchanged by this task): the retry date is measured from the
  decline time, so a 03:00 cron picks it up on the first run after that
  instant.
- Recovery reset (KT-038 Tasks 4C/4D): both hosted activation writes — the
  locally recovered one (`BillingHostedCompletionService.activateSubscription`)
  and the live webhook's (`CardcomWebhookService.processVerifiedSuccess`) — set
  `renewalAttempts` to 0 in the same locked `PAST_DUE` -> `ACTIVE` update, so
  the next cycle starts a fresh 3-day / 7-day / `PAST_DUE` sequence. The
  webhook resets only when the row it locked was `PAST_DUE`.
### Read-only reconciliation (KT-038 Task 5A2)

Invariant: `UNKNOWN` and `MANUAL_REVIEW` are never a signal to charge. The
sweep (`BillingReconciliationService`, run FIRST inside
`SubscriptionRenewalService.processDueRenewals` — the existing 03:00 cron and
admin trigger — bounded to 20 attempts, serial, never able to fail the batch)
only looks up: a token attempt via CardCom `GetTransactionByExternalUniqTran`
(request: TerminalNumber, ApiName, ExternalUniqTranId) with its persisted key,
a hosted attempt via `getLowProfileResult` with its persisted LowProfile id.
`chargeByToken`, checkout, refund and void are never reachable from it.
- Claim: `claimForReconciliation` (state-version CAS + lease) — of two workers
  one wins. Outcomes go through `applyNormalizedOutcome` only.
- `CAPTURED` only for a verified result: transaction id present, amount equal to
  the attempt, terminal (when reported) equal, not a refund/other currency; a
  hosted result is checked by the shared `validateHostedTransactionResult`
  (LowProfileId, ReturnValue owner/subscription/plan/attempt). A token renewal
  is then finalized by the normal renewal flow (which runs after the sweep), a
  hosted capture by `completeCapturedHostedAttempt`/the 3B sweep.
- `DECLINED` only for a hosted result that belongs to the attempt AND reports a
  rejected transaction (`TranzactionInfo.ResponseCode` non-zero, not 700/701).
  A direct lookup never declines: CardCom documents no "not found"/decline
  meaning for it, so not-found, non-zero, malformed, timeout, 400/401 and any
  mismatch stay `UNKNOWN` (counter +1, 1m/5m/30m/2h/24h backoff) and the
  obligation stays blocked; after the ladder the attempt is `MANUAL_REVIEW`.
- Expired `PROCESSING` becomes `UNKNOWN` (never `CREATED`); a live lease is
  untouched. Its first lookup waits for the 1-minute backoff, i.e. the next
  sweep.
- Local pre-submission failures (KT-038 Task 5A3) are never `UNKNOWN`, never
  reconciled and never call CardCom. The executor throws a
  `BillingPreSubmissionError` carrying a typed
  `BillingPreSubmissionFailureReason` (never parsed from a message), and
  `applyPreSubmissionFailure` applies one atomic transition (sanitized
  `LOCAL_<REASON>` category, no token/key/raw error stored or logged):
  customer action (no payment method, no token, missing/expired expiry) ends the
  attempt `DECLINED` without the 3/7-day policy (`renewalAttempts` untouched)
  and moves an ACTIVE subscription to `PAST_DUE` with the standard grace period,
  so hosted recovery/change-payment-method can collect; system action (token
  decryption failure) ends `MANUAL_REVIEW` with the subscription unchanged and
  the obligation still blocked. Both are excluded from the sweep by status.
- Limitations: the direct lookup response does not echo the key, so a match rests
  on CardCom honouring the lookup; a reconciled token capture whose subscription
  is no longer ACTIVE (e.g. `CANCELED`) is not finalized by the renewal flow
  (existing behavior, unchanged); a `MANUAL_REVIEW` attempt has no
  resolution path yet (`MANUAL_REVIEW` -> `UNKNOWN`/`CAPTURED` exists in the
  state machine but no caller).

### Admin billing exceptions (KT-038 Task 5B, read-only)

Visibility only — no resolve/retry/charge/refund action exists, and nothing here
touches reconciliation, subscription or payment state.
- `GET /admin/billing/subscriptions` carries a compact indicator per row
  (`unresolvedBillingAttemptCount`, `mostSevereUnresolvedAttemptStatus`,
  `MANUAL_REVIEW` over `UNKNOWN`) from ONE grouped `billing_attempt` ⨝
  `billing_obligation` query — no per-row lookups. It is advisory: if that query
  fails (for example billing tables not yet migrated) it is logged and the
  badges are omitted rather than failing the list.
- `GET /admin/billing/subscriptions/:id/unresolved-attempts` (same
  `assertAdmin` gate as every admin route; 404 for an unknown subscription)
  returns that subscription's `UNKNOWN`/`MANUAL_REVIEW` attempts, newest first,
  as `AdminUnresolvedBillingAttemptResponse`
  (`dtos/admin/admin-billing-exception.dto.ts`). Entities are never serialized:
  columns are selected explicitly, and the persisted `failure_category` is only
  mapped (`classifyUnresolvedAttempt`) to a whitelisted code plus who must act
  (`CUSTOMER_PAYMENT_METHOD` for `LOCAL_*` payment-method failures,
  `INTERNAL_REVIEW` for token decryption failure or exhausted reconciliation,
  `AUTOMATIC_CHECK` for `UNKNOWN`). Never returned: card/encrypted token, card
  number, credentials, raw provider response/exception text, the
  `ExternalUniqTranId`, terminal ref, lease owner or provider response code.
  `cardTokenRecovered` is a boolean derived from the attempt's events'
  `cardTokenStored` flag.

- `GET /billing/plans`, `GET /billing/me`, `POST /billing/trial` — plan listing and current billing state; idempotent trial creation.
- `POST /billing/checkout/preview` / `POST /billing/checkout` — price preview and CardCom LowProfile checkout session creation; activation happens only via the webhook, never the checkout response.
- `POST /billing/cardcom/webhook` — CardCom posts payment results here; `CardcomWebhookService` verifies/activates subscriptions; errors are swallowed so CardCom doesn't retry-storm.
- `POST /billing/change-payment-method` → `GET /billing/change-payment-method/status?lowProfileId=…` — replace the saved card (CreateTokenOnly + J2, never charges). The status endpoint reports the outcome of ONE attempt, keyed by its LowProfileId, and is what the Open Fields dialog polls. See "Change-payment-method completion" below.

## Change-payment-method completion

Completion is resolved per-attempt (`BillingService.getChangePaymentMethodStatus`), never as "the latest payment-method event for this user" — that could not tell two attempts apart. `PAYMENT_METHOD_UPDATE_REQUESTED` (written when the LowProfile is created) is the anchor; `metadata.cardcomLowProfileId` ties it to the attempt, and both success and failure events carry `metadata.lowProfileId`.

SUCCESS is accepted from **either** of two independent signals:
1. a `PAYMENT_METHOD_UPDATED` event for this LowProfileId, or
2. `payment_method.updatedAt` at/after the attempt started.

Signal 2 exists because `BillingEventService.logEvent` is best-effort and swallows write errors: without it, a lost audit-log insert would strand a genuinely-replaced card as "pending" forever. Signal 2 reads the row the renewal charge actually uses, so it cannot report success unless the card really was written.

If neither signal has landed after `CHANGE_PM_RECONCILE_AFTER_MS` (20s), the status endpoint calls `CardcomWebhookService.reconcileChangePaymentMethod()`, which pulls `GetLpResult` itself and routes through the *same* `applyVerifiedChangePaymentMethod` the webhook uses. It writes its webhook-log row under the **same idempotency key** the webhook would have used, so whichever path arrives second is deduped by the existing unique-key gate — no duplicate token writes, no double processing. Reconciliation is driven by the frontend's polling, so nothing runs for users who are not waiting.

## Development requirement: CARDCOM_WEBHOOK_BASE_URL

CardCom calls the webhook from the public internet, so **`CARDCOM_WEBHOOK_BASE_URL` in `backend/.env` must point at the currently active ngrok HTTPS URL**, and the backend must be running and reachable through it. The URL is baked into each LowProfile deal at creation time (`CardcomService`, `WebHookUrl`), so a deal created against a stale tunnel can never be delivered — restarting ngrok later does not rescue it.

Free ngrok URLs change on every restart. After restarting the tunnel:
1. copy the new `https://…ngrok-free.dev` URL,
2. update `CARDCOM_WEBHOOK_BASE_URL`,
3. restart the backend so `CardcomService` picks it up.

Symptom of a stale/dead tunnel: the change-payment-method dialog sits in "still processing", nothing appears in `cardcom_webhook_log`, and the only trace is a `PAYMENT_METHOD_UPDATE_REQUESTED` billing event. The reconciliation fallback now recovers these automatically after ~20s (the backend logs a warning naming this env var), but the underlying tunnel must still be fixed — reconciliation is a safety net, not a substitute for webhook delivery, and the CHECKOUT flow has no equivalent fallback.
- `POST /billing/events/:eventId/receipt/resend-email` / `/generate` — resend or backfill a payment receipt.
- `/admin/billing/*` — admin plan CRUD (create/update/activate/deactivate), subscription discount edits, manual/forced renewal triggers (mirrors the daily 03:00 cron in `SubscriptionRenewalService`). The subscription list enriches billing rows with the user's current `hasOpenBanking` flag and `lastLoginAt` timestamp.

## Admin trial-end override

`PATCH /admin/billing/subscriptions/:id/trial-end` remains behind the controller's
server-side Firebase/admin authorization check. The service locks the subscription
row and saves the date atomically with one narrowly scoped status transition: a
`TRIAL_EXPIRED` subscription returns to `TRIAL` only when the new `trialEnd` is in
the future. Null or non-future dates and all other statuses preserve status. This
admin correction does not activate paid billing, charge CardCom, or alter payment
method, current-period, next-billing, retry, cancellation, or end fields. The
response includes the resulting `status` so clients can refresh accurately.

## Related topics
- users (FirebaseAuthGuard deps User/Delegation; admin role check for admin-billing)
- documents (receipt PDF generation/storage)
- mail (receipt email delivery)
- business (billing business-type-specific pricing)
