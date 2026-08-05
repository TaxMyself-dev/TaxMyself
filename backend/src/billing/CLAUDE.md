## Purpose
Subscription billing: plan catalog, trial/subscription lifecycle, CardCom payment integration (checkout + webhook-driven activation), recurring renewals, receipts, and an admin back-office for plans/subscriptions.

## Key entities/files
- `entities/subscription-plan.entity.ts` — `SubscriptionPlan`: slug, pricing (agorot), included `modules` (ModuleName[]), trial days, active/public/display flags.
- `entities/subscription.entity.ts` — `Subscription`: one per user (unique on firebaseId), status, trial/period/billing dates, renewal attempts, per-subscription discount.
- `entities/payment-method.entity.ts` — `PaymentMethod`: stored CardCom token + card display info.
- `entities/billing-event.entity.ts` — `BillingEvent`: append-only audit trail (checkout/payment/renewal events), amounts incl. VAT breakdown, links to a generated receipt document.
- `entities/cardcom-webhook-log.entity.ts` — `CardcomWebhookLog`: idempotency-keyed log of every inbound CardCom webhook call.
- `services/billing.service.ts`, `pricing.service.ts`, `cardcom.service.ts`, `cardcom-webhook.service.ts`, `billing-event.service.ts`, `billing-receipt.service.ts`, `subscription-access.service.ts`, `subscription-renewal.service.ts`, `admin-billing.service.ts` — plan pricing/checkout, CardCom API calls, webhook processing, receipt generation, module-access checks (`SubscriptionGuard`), daily renewal batch, admin CRUD.
- `billing.controller.ts` (`/billing`), `admin-billing.controller.ts` (`/admin/billing`, admin-only), `cardcom-webhook.controller.ts` (`/billing/cardcom/webhook`, unauthenticated, always returns 200).

## Main flows
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
- `/admin/billing/*` — admin plan CRUD (create/update/activate/deactivate), subscription discount edits, manual/forced renewal triggers (mirrors the daily 03:00 cron in `SubscriptionRenewalService`).

## Related topics
- users (FirebaseAuthGuard deps User/Delegation; admin role check for admin-billing)
- documents (receipt PDF generation/storage)
- mail (receipt email delivery)
- business (billing business-type-specific pricing)
