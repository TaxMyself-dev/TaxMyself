# CardCom Billing Flow

End-to-end flow for KeepInTax's own subscription billing via CardCom: initial
checkout + webhook activation, monthly recurring charge-by-token renewals,
receipt (invoice) generation reusing the app's own document-numbering system,
and the failure-handling/blocking safety net added around it.

---

## High-level flow

```
FIRST PAYMENT (checkout + webhook — asynchronous)
  User clicks "Start now" on a plan (first purchase OR upgrade — same button)
    └─ POST billing/checkout → BillingService.createCheckout
         ├─ blocked if subscription has an unresolved receipt failure (ConflictException)
         ├─ CardcomService.createLowProfileCheckout → hosted payment page URL
         └─ billing_event: CHECKOUT_CREATED (canonical VAT breakdown stored here)
    User enters card details on CardCom's hosted page
    CardCom charges the card, then POSTs to WebHookUrl (async, out-of-band)
       └─ POST billing/cardcom/webhook → CardcomWebhookService.handleWebhook
            ├─ idempotency gate: cardcom_webhook_log (unique idempotencyKey)
            ├─ independently re-verifies via GetLpResult (never trusts payload alone)
            ├─ if subscription already ACTIVE on the SAME planId → skip
            │    (logs DUPLICATE_PAYMENT_IGNORED — money moved, nothing else happens)
            ├─ else: activate subscription (status/planId/periods), commit
            └─ post-commit: billing_event chain (WEBHOOK_RECEIVED → PAYMENT_VERIFIED
               → PAYMENT_SUCCESS → SUBSCRIPTION_ACTIVATED) → generateReceiptAfterPayment

RECURRING MONTHLY CHARGE (renewal cron — synchronous, no webhook at all)
  Daily cron @ 03:00 Asia/Jerusalem → SubscriptionRenewalService.runDailyRenewalCron
    └─ processDueRenewals(): status=ACTIVE AND nextBillingDate<=NOW()
         └─ per subscription, chargeSubscription():
              ├─ row-locked (pessimistic_write) — safe against concurrent runs
              ├─ blocked if unresolved receipt failure → outcome 'blocked_pending_receipt'
              ├─ idempotent per billing period (renewal:{subId}:{YYYY-MM})
              ├─ CardcomService.chargeByToken → CardCom returns the result
              │    SYNCHRONOUSLY in the same HTTP call — no webhook involved
              ├─ success → advance period, commit, then generateReceiptAfterRenewal
              └─ failure → retry at +3d/+7d (max 3 attempts), then PAST_DUE + grace period

RECEIPT GENERATION (shared by both paths above — same 3-step pipeline)
  BillingReceiptService.createReceiptForPayment(issuer, {...})
    └─ DocumentsService.createBillingSystemReceipt → createDoc
         (creates Documents/DocLines/DocPayments rows, TAX_INVOICE_RECEIPT,
          + journal entry — no PDF yet)
  BillingReceiptService.finalizeBillingReceiptPdfs
    └─ DocumentsService.finalizeBillingReceipt (PDF gen + Firebase upload, idempotent)
  BillingReceiptService.sendReceiptEmailForPaymentEvent
    └─ emails the PDF to the customer (never throws — failure just logged)
  → billing_event.receiptDocId set on success. If ANY step throws, the whole
    thing is caught, logged as RECEIPT_FAILED, and the event's receiptDocId
    stays NULL — which is exactly what blocks further payments (see below).
```

---

## Database tables

| Table | Role |
|---|---|
| `subscription` | Core state: `status`, `planId`, `firebaseId` (unique), period dates, `paymentMethodId`, discount fields, `renewalAttempts`, `gracePeriodEndsAt` |
| `subscription_plan` | Plan catalog: price, modules, trial days, active/public flags |
| `payment_method` | CardCom token (AES-256 encrypted), card brand/last4/expiry |
| `billing_event` | Append-only audit trail — every step of both flows logs a row here (see event types below) |
| `cardcom_webhook_log` | Raw webhook payloads + idempotency (`idempotencyKey` unique) — **checkout flow only**, renewal never touches this table |
| `documents` | The receipt itself (`docType='TAX_INVOICE_RECEIPT'`). Unique: `(issuerBusinessNumber, docType, docNumber)` |
| `doc_lines` | Receipt line items |
| `doc_payments` | Receipt payment lines |
| `setting_documents` | Numbering counter, shared with every document type in the app (not billing-specific) — `(userId, issuerBusinessNumber, docType)` → `currentIndex` |
| `business` | Issuer identity — KeepInTax's own business row, looked up via `COMPANY_BILLING_FIREBASE_ID`/`COMPANY_BILLING_BUSINESS_NUMBER` env vars (`BillingIssuerConfigService`) |
| `user` | Recipient name/email for the receipt (the paying customer) |

### `billing_event.eventType` values actually used in this flow
`CHECKOUT_CREATED`, `WEBHOOK_RECEIVED`, `PAYMENT_VERIFIED`, `PAYMENT_SUCCESS`,
`PAYMENT_FAILED`, `SUBSCRIPTION_ACTIVATED`, `RENEWAL_SUCCESS`, `RENEWAL_FAILED`,
`RETRY_SCHEDULED`, `RECEIPT_FAILED`, `DUPLICATE_PAYMENT_IGNORED`.

---

## Key services

| Service | Responsibility |
|---|---|
| `BillingService` (`billing.service.ts`) | User-facing: plans, checkout creation, billing state, receipt-email resend |
| `CardcomService` (`cardcom.service.ts`) | Thin CardCom API client — `createLowProfileCheckout`, `getLowProfileResult`, `chargeByToken` |
| `CardcomWebhookService` (`cardcom-webhook.service.ts`) | Verifies + processes the checkout webhook, activates the subscription |
| `SubscriptionRenewalService` (`subscription-renewal.service.ts`) | Daily cron + manual admin trigger for charge-by-token renewals |
| `BillingEventService` (`billing-event.service.ts`) | Audit log writer/reader; `getUnresolvedReceiptFailure` is the blocking gate |
| `BillingReceiptService` (`billing-receipt.service.ts`) | The 3-step receipt pipeline shared by both payment flows |
| `BillingIssuerConfigService` (`billing-issuer-config.service.ts`) | Resolves KeepInTax's own `Business` row as the receipt issuer |
| `SubscriptionAccessService` (`subscription-access.service.ts`) | Single source of truth for "which modules can this user access" |
| `AdminBillingService`/`AdminBillingController` | Admin panel: plans CRUD, subscriptions list, manual renewal trigger, **pending-receipt-failure list + manual generate** |
| `DocumentsService` (`src/documents/documents.service.ts`) | Generic document engine — `createDoc`, numbering (`incrementCurrentIndex`/`getCurrentIndexes`), PDF generation, Firebase upload |

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `billing/checkout` | Create a CardCom hosted-checkout session (first purchase **and** upgrade — same endpoint, no proration) |
| `POST` | `billing/cardcom/webhook` | CardCom's async payment-result callback (unauthenticated by design — must be publicly reachable) |
| `POST` | `admin/billing/subscriptions/:id/renew` | Manually run one subscription through the renewal flow |
| `POST` | `admin/billing/renewals/run-due` | Manually run the full daily-cron batch on demand |
| `GET` | `admin/billing/receipts/pending` | List successful charges with no receipt (blocked subscriptions) |
| `POST` | `admin/billing/receipts/:billingEventId/generate` | Manually run the receipt pipeline for one stuck event; un-blocks the subscription on success |

---

## Behavior matrix

### Same-plan vs. different-plan payment while already ACTIVE
| Scenario | What happens |
|---|---|
| Pay again for the **same** plan already active | `processVerifiedSuccess` skips activation entirely (`subscription.status===ACTIVE && planId===planId`). Logs `DUPLICATE_PAYMENT_IGNORED` (money was real, charge is otherwise a no-op). No new receipt. |
| Pay for a **different** plan (upgrade/downgrade) | Always proceeds: full period reset (`currentPeriodStart=now`, `+1 month`), **no proration** — full new-plan price charged regardless of time left on the old plan. |

### Receipt failure → payment block
| State | Effect |
|---|---|
| Latest `PAYMENT_SUCCESS`/`RENEWAL_SUCCESS` has `receiptDocId` set | Subscription is free to pay again (checkout or renewal) |
| Latest one has `receiptDocId IS NULL` | `BillingService.createCheckout` throws `ConflictException`; `SubscriptionRenewalService.chargeSubscription` returns `outcome: 'blocked_pending_receipt'` without charging. Resolve via `POST admin/billing/receipts/:id/generate` (admin panel → "קבלות חסרות" tab). |

### ACTIVE access without a recent renewal
| Condition | Access |
|---|---|
| `nextBillingDate`/`currentPeriodEnd` within `ACTIVE_BILLING_GRACE_DAYS` (3 days) of now | Full plan-module access, as normal |
| Overdue by more than the grace window (cron down, or blocked pending a manual receipt fix) | No access — `SubscriptionAccessService` cuts it, same as it already did for `CANCELED`/`PAST_DUE` |

### Renewal charge failure
| Attempt | Result |
|---|---|
| 1st or 2nd failure | `renewalAttempts++`, retry scheduled at `+3d`/`+7d`, `status` unchanged (stays `ACTIVE`) |
| 3rd (final) failure | `status → PAST_DUE`, 14-day `gracePeriodEndsAt` |
| Note | Once `PAST_DUE`, the daily cron **never revisits it** (query is `status=ACTIVE` only) — recovery requires the user to go through `checkout` again |

---

## Document numbering (shared with the whole app, not billing-only)

- Counter lives in `setting_documents`, keyed by `(userId, issuerBusinessNumber, docType)`.
- **Manual document creation**: frontend shows a "first document of this type" dialog
  with a suggested starting number (`DocTypeDefaultStart` in
  `frontend/src/app/pages/doc-create/doc-cerate.enum.ts`), the user confirms/edits it,
  and it's saved via `POST setting-initial-index/:typeDoc` **before** the first document
  exists — so the backend's own fallback default is never actually exercised in this path.
- **Automated billing receipts** (`createBillingSystemReceipt`) never show that dialog —
  they hit the backend's `DEFAULT_INITIAL_DOC_INDEX` (`documents.service.ts`) fallback
  directly if no counter row exists yet. **This constant and the frontend's
  `DocTypeDefaultStart` must be kept numerically identical** (see comments on both) —
  they used to be completely unsynced (different values *and* different docType↔range
  assignments), which is exactly how a KeepInTax billing receipt once got docNumber
  `300000` instead of the intended `30000` (see bug list below).
- Assigning a number is **atomic**: `incrementCurrentIndex` takes a `pessimistic_write`
  row lock (inside the caller's transaction) before reading/incrementing `currentIndex`,
  and the document actually saved always uses `currentIndex - 1` (the server-computed,
  just-reserved value) — **never** whatever `docNumber` the caller happened to send in
  (that value can be a stale "peek" from an earlier request).

---

## Interesting things found this session (bugs + fixes)

1. **`documents/get-docs` had no ownership check.** The `documents` table has no
   `firebaseId` column, and the query filtered only by `issuerBusinessNumber` — any
   authenticated user who knew another business's number could fetch its documents
   directly via the API (though the normal UI never exposed this, since the business
   dropdown is itself scoped by `firebaseId`). **Fixed**: `getDocuments` now verifies
   the caller owns that `issuerBusinessNumber` via `Business` before querying.

2. **`business.businessNumber` had no uniqueness constraint** — two different
   `firebaseId` users could register the exact same business number through normal
   signup, which (combined with bug #1's missing check) meant they'd see each other's
   documents through completely normal UI use, not just API tampering. **Fixed**:
   `createBusiness` now rejects a `businessNumber` already registered under a different
   `firebaseId`.

3. **Document-numbering race condition** (`incrementCurrentIndex`/`getCurrentIndexes`)
   — no row lock, and the actual document always trusted whatever `docNumber` the
   caller supplied (a stale "peek"), not the counter's real state. Two near-simultaneous
   document creations (or two webhook attempts) could compute the same number and crash
   on the DB's unique constraint. **Fixed**: pessimistic row lock + the document always
   uses the atomically-incremented number, never the caller-supplied one.

4. **String-concatenation bug in the numbering "first time" path**, exposed by fix #3:
   `initialDocIndex + 1` where `initialDocIndex` is always a *string* at runtime
   (`data.docData.docNumber` is always stringified upstream) → `"30000" + 1` produces
   `"300001"` (concatenation), not `30001` (addition). This is how a KeepInTax billing
   receipt got docNumber `300000` on a fresh environment. **Fixed**: `Number(initialDocIndex)`
   before the arithmetic.

5. **Frontend/backend numbering defaults were completely unsynced** — `DocTypeDefaultStart`
   (frontend dialog) and `DEFAULT_INITIAL_DOC_INDEX` (backend fallback) had different
   values *and* different docType-to-range assignments, with no relationship to each
   other. Only masked in the manual-creation flow because the frontend's dialog always
   seeds the real value first; fully exposed in the automated billing-receipt flow,
   which only ever sees the backend's constant. **Fixed**: backend value is now the
   source of truth; frontend constant updated to match exactly, with cross-referencing
   comments in both files so a future change to one prompts a change to the other.

6. **Duplicate payment on an already-ACTIVE plan was invisible.** The webhook's
   same-plan idempotency skip returned before any `billing_event` was ever written —
   a real CardCom charge could happen with zero record beyond a raw
   `cardcom_webhook_log` row. **Fixed**: logs `DUPLICATE_PAYMENT_IGNORED` (with amount +
   deal number) before returning.

7. **A failed receipt was a permanent, invisible dead end.** `RECEIPT_FAILED` was
   logged and swallowed with no retry and no visibility, and (worse) once the
   subscription was `ACTIVE` on that plan, all future webhooks/renewals for it were
   silently skipped as duplicates — so the missing receipt could never resolve itself.
   **Fixed** (deliberately *not* auto-retry, per product decision): any subscription
   whose latest successful charge has no `receiptDocId` is blocked from further
   payments (`createCheckout` + `chargeSubscription` both check
   `getUnresolvedReceiptFailure`) until an admin manually generates the receipt via the
   new admin panel tab / endpoint — which reuses the exact same 3-step pipeline.

8. **`ACTIVE` status granted access forever with no date check**, unlike `CANCELED`/
   `PAST_DUE` which both verify a date. If the renewal cron ever silently stopped
   running — or a subscription is now intentionally blocked per #7 — the user would
   keep full paid access indefinitely with nothing to notice or correct it. **Fixed**:
   `ACTIVE` now also lapses if `nextBillingDate`/`currentPeriodEnd` is more than
   `ACTIVE_BILLING_GRACE_DAYS` (3) days overdue.

9. **NestJS logger level gotcha (unrelated to billing logic, but wasted real debugging
   time)**: `main.ts`'s `NestFactory.create(AppModule, { logger: [...] })` array was
   missing `'log'` — so every `this.logger.log(...)` call across the whole app
   (including most of the billing/webhook trace messages) was silently dropped, while
   raw `console.log` calls were unaffected. Resolved by switching the specific
   diagnostic messages in the billing/webhook flow to `console.log` directly, rather
   than changing the global logger config.

---

## Known gaps (not addressed — flagged, left as-is by product decision)

- **No proration on plan change.** Upgrading mid-cycle charges the full new-plan price
  and fully resets the billing period; no credit for unused time on the old plan.
- **Renewal is cron-only, no webhook fallback.** If the cron process itself never runs
  (crash, bad deploy), nothing else in the system independently notices — the
  `ACTIVE_BILLING_GRACE_DAYS` access cutoff (bug #8 fix) limits the blast radius to "user
  loses access after a few days," not "renewal eventually happens some other way."
- **No automatic retry for a failed receipt** — intentional, see bug #7. Resolution is
  always a manual admin action.
