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
- `POST /billing/events/:eventId/receipt/resend-email` / `/generate` — resend or backfill a payment receipt.
- `/admin/billing/*` — admin plan CRUD (create/update/activate/deactivate), subscription discount edits, manual/forced renewal triggers (mirrors the daily 03:00 cron in `SubscriptionRenewalService`).

## Related topics
- users (FirebaseAuthGuard deps User/Delegation; admin role check for admin-billing)
- documents (receipt PDF generation/storage)
- mail (receipt email delivery)
- business (billing business-type-specific pricing)
