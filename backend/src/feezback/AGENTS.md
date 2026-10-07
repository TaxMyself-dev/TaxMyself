## Purpose
Integrates with Feezback, the Open Banking (AISP) data provider: handles the consent flow, fetches bank account/card transactions, normalizes them into the app's transaction pipeline, and processes async webhooks that signal consent/data-availability changes.

## Key entities/files
- `feezback.service.ts` — `FeezbackService`: the main orchestrator — consent link creation, `refreshUserSources` (discovers accounts/cards **with balances**, upserts `Source` rows incl. `isDirect`, flips `User.hasOpenBanking`), `getAndSaveBankTransactions`/`getAndSaveUserCardTransactions` (fetch + normalize transactions), admin diagnostics, retry/pull-single-source helpers, transaction normalization (`normalizeBankTransactions`/`normalizeCardTransactions`).
- Direct/Debit cards (`Source.isDirect`): per the Open Banking standard (confirmed by Feezback), credit cards always return balances and direct cards never do. Card syncs fetch cards with `withBalances: true`, persist `isDirect` on `Source` BEFORE any transaction fetch (`determineIsDirect`), and EXCLUDE direct cards from the card-transaction pull — their transactions arrive via the bank-account feed (importing both would duplicate them). Direct cards get the terminal per-source status `skipped_direct` (never `not_synced`/`failed`), are never auto-retried (`isRetryablePendingStatus`), and `retrySource` re-checks `Source.isDirect` + fresh balance detection to refuse explicit pulls. On a failed cards fetch nothing is guessed: no `isDirect` write, no card transactions fetched.
- `feezback-jwt.service.ts` — `FeezbackJwtService`: signs RS512 JWTs (consent flow token, API access token) using a configured private key.
- `core/feezback-auth.service.ts` — token URL/consent-link URL config and access-token caching.
- `core/feezback-http.client.ts` / `core/feezback-errors.ts` / `core/feezback-retry.utils.ts` — low-level HTTP client with retry and normalized error mapping. Admin date-range diagnostics capture every actual attempt as a copyable cURL command while replacing authentication values with `<REDACTED>`. Request URLs, response bodies, and retry chatter are not printed to the backend terminal; the admin pull emits only a compact per-source completion summary.
- `api/feezback-api.service.ts` — general user-level API calls (consents, accounts, account transactions) via `FeezbackHttpClient` + `FeezbackAuthService`/`FeezbackJwtService`.
- `consent/feezback-consent-api.service.ts` — consent-scoped API calls. Both bank-account and card transaction pulls use explicit V2 URLs built from `sub`, `consentId`, and source `resourceId`; account/card discovery remains V1.
- `webhook/feezback-webhook.controller.ts` / `feezback-webhook.service.ts` — receives Feezback webhooks, persists them idempotently (`FeezbackWebhookEvent`, deduped by `payloadHash`), and dispatches `ConsentStatusChanged`/`UserDataIsAvailable`/`DataRefreshComplete` to handlers.
- `webhook/entities/feezback-webhook-event.entity.ts` — `FeezbackWebhookEvent`: raw webhook audit log with processing status.
- `router/feezback-webhook-router.service.ts` — forwards incoming webhooks to a configured `PROD_WEBHOOK_URL` (used for dev/staging environments proxying to prod).
- `feezback.controller.ts` — `FeezbackController` at route `feezback`, gated by `RequireModule(OPEN_BANKING)`; includes consent-link creation, account/transaction fetch, admin diagnostic and manual-sync endpoints, plus several debug/structure-analysis endpoints.

## Main flows
- `POST /feezback/consent-link` (auth) — stamps consent-initiation timestamp, returns a Feezback consent URL.
- `POST /feezback/webhook-router` — public webhook receiver; responds 200 immediately and forwards the payload async.
- Webhook processing (`FeezbackWebhookService.handleWebhook`) — `UserDataIsAvailable`/`DataRefreshComplete` trigger `refreshUserSources` + full sync; `ConsentStatusChanged` clears stale consent IDs on terminal states.
- `GET /feezback/user-accounts`, `GET /feezback/transactions` — direct pass-through account/transaction reads.
- `POST /feezback/admin-user-transactions` — admin-only, synchronous date-range pull. It persists normalized bank/card transactions and returns a token-free diagnostic bundle containing a run ID, exact `sub`/user identifier, request filters, per-source V2 metadata, redacted cURL commands, raw/extracted/normalized transactions, responses/errors, sent/received timestamps, and suspected provider duplicates (same source/business fields/note hash but different external IDs). Suspected duplicates are diagnostic only and are never merged or deleted. A `partial` result means some sources failed even if other-source transactions were successfully saved. `admin/refresh-sources/:firebaseId`, `admin/pull-source/:firebaseId`, and `admin/accounts/:firebaseId` provide the other manual sync/retry diagnostics.
- Passing `persistTransactions=false` to the admin pull makes it diagnostic-only:
  provider data is fetched and returned, but normalized transactions and source
  sync status are not persisted. Source discovery/upsert behavior inside the
  fetch path remains unchanged.
- Transaction normalization pipeline: raw Feezback bank/card transactions → `NormalizedTransaction[]` (currency-aware `paymentIdentifier` plus ingestion-only ASPSP provenance) → `TransactionProcessingService.process()`. Before persistence, V2 variants sharing `(paymentIdentifier, aspspOriginalId)` are collapsed; the no-`entryReference` variant is preferred to retain the external ID previously returned by V1. Rows without both keys are never heuristically merged. Each provider response is timestamped immediately after its HTTP promise resolves. When such V2 duplicates are detected, one best-effort operational email is sent to `info@keepintax.co.il` with the response timestamp, source, ASPSP ID, returned IDs, and retained ID; mail failure is logged and does not fail transaction processing. All alert metadata is transient and requires no schema change.

## Pagination and cache-readiness invariants

- Consent-scoped bank and card V2 transaction reads use zero-based pages at
  Feezback's maximum supported `pageSize` (1000), continuing until a short
  page is returned. Any page failure fails that source instead of silently
  persisting an incomplete first page; stable provider transaction IDs provide
  final deduplication during normalization.
- A persisted admin date-range pull that produces usable normalized rows also
  promotes the client's cache state to `completed` (success or
  partial-success), allowing transaction read endpoints to expose saved rows.

## Related topics
- transactions (`TransactionsModule`, `TransactionProcessingService`, `UserSyncStateService`, `Source` entity — this module is the primary external data source feeding the transaction pipeline)
- users (`UsersModule`, `User`/`Child` entities — `hasOpenBanking` flag, admin checks)
- billing (`BillingModule` — module access checks, though OPEN_BANKING permission itself comes from the subscription plan)
- business (`Business` entity registered in module)
- expenses (`Expense` entity registered in module)
- documents (`SettingDocuments` entity registered in module)
- delegation (`Delegation` entity registered in module)
- shared (`SharedService`)
