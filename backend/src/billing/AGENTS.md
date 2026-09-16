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
