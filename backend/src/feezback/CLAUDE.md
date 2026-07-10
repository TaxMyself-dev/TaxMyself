## Purpose
Integrates with Feezback, the Open Banking (AISP) data provider: handles the consent flow, fetches bank account/card transactions, normalizes them into the app's transaction pipeline, and processes async webhooks that signal consent/data-availability changes.

## Key entities/files
- `feezback.service.ts` — `FeezbackService`: the main orchestrator — consent link creation, `refreshUserSources` (discovers accounts/cards, upserts `Source` rows, flips `User.hasOpenBanking`), `getAndSaveBankTransactions`/`getAndSaveUserCardTransactions` (fetch + normalize transactions), admin diagnostics, retry/pull-single-source helpers, transaction normalization (`normalizeBankTransactions`/`normalizeCardTransactions`).
- `feezback-jwt.service.ts` — `FeezbackJwtService`: signs RS512 JWTs (consent flow token, API access token) using a configured private key.
- `core/feezback-auth.service.ts` — token URL/consent-link URL config and access-token caching.
- `core/feezback-http.client.ts` / `core/feezback-errors.ts` / `core/feezback-retry.utils.ts` — low-level HTTP client with retry and normalized error mapping.
- `api/feezback-api.service.ts` — general user-level API calls (consents, accounts, account transactions) via `FeezbackHttpClient` + `FeezbackAuthService`/`FeezbackJwtService`.
- `consent/feezback-consent-api.service.ts` — consent-scoped API calls (cards, card balances/transactions under a specific `consentId`).
- `webhook/feezback-webhook.controller.ts` / `feezback-webhook.service.ts` — receives Feezback webhooks, persists them idempotently (`FeezbackWebhookEvent`, deduped by `payloadHash`), and dispatches `ConsentStatusChanged`/`UserDataIsAvailable`/`DataRefreshComplete` to handlers.
- `webhook/entities/feezback-webhook-event.entity.ts` — `FeezbackWebhookEvent`: raw webhook audit log with processing status.
- `router/feezback-webhook-router.service.ts` — forwards incoming webhooks to a configured `PROD_WEBHOOK_URL` (used for dev/staging environments proxying to prod).
- `feezback.controller.ts` — `FeezbackController` at route `feezback`, gated by `RequireModule(OPEN_BANKING)`; includes consent-link creation, account/transaction fetch, admin diagnostic and manual-sync endpoints, plus several debug/structure-analysis endpoints.

## Main flows
- `POST /feezback/consent-link` (auth) — stamps consent-initiation timestamp, returns a Feezback consent URL.
- `POST /feezback/webhook-router` — public webhook receiver; responds 200 immediately and forwards the payload async.
- Webhook processing (`FeezbackWebhookService.handleWebhook`) — `UserDataIsAvailable`/`DataRefreshComplete` trigger `refreshUserSources` + full sync; `ConsentStatusChanged` clears stale consent IDs on terminal states.
- `GET /feezback/user-accounts`, `GET /feezback/transactions` — direct pass-through account/transaction reads.
- `GET /feezback/admin-user-transactions`, `admin/refresh-sources/:firebaseId`, `admin/pull-source/:firebaseId`, `admin/accounts/:firebaseId` — admin-only diagnostics and manual sync/retry triggers.
- Transaction normalization pipeline: raw Feezback bank/card transactions → `NormalizedTransaction[]` (dedup, currency-aware `paymentIdentifier` derivation) → handed to `TransactionProcessingService.process()` for persistence.

## Related topics
- transactions (`TransactionsModule`, `TransactionProcessingService`, `UserSyncStateService`, `Source` entity — this module is the primary external data source feeding the transaction pipeline)
- users (`UsersModule`, `User`/`Child` entities — `hasOpenBanking` flag, admin checks)
- billing (`BillingModule` — module access checks, though OPEN_BANKING permission itself comes from the subscription plan)
- business (`Business` entity registered in module)
- expenses (`Expense` entity registered in module)
- documents (`SettingDocuments` entity registered in module)
- delegation (`Delegation` entity registered in module)
- shared (`SharedService`)
