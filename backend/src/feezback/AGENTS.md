## Purpose
Main integration retains MailService for provider duplicate alerts alongside the optional OpenBankingEnrollmentService for server-verified future billing. Tests supply both dependencies in that order.
The temporary legacy diagnostic bypass was removed. Consent-link enforces the enrollment/card prerequisite, then creates the onboarding link without provider data discovery or /token requests. Connection proof remains in post-consent/webhook discovery and daily pending recovery. Inherited legacy diagnostic flags have no effect. Local backend launch remains start:watch.
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
- Failed token acquisition and consent-link creation log `[FeezbackResponse]`
  with HTTP status, endpoint and provider response body. Diagnostics redact
  credential/identity fields, signed JWTs and echoed request tokens; Axios
  request config/headers are never serialized. Other transaction responses
  retain the existing quiet-terminal policy.
- KT-053: `hasOpenBanking` represents a current provider-verified connection,
  not a successful HTTP call or historical onboarding. Discovery verifies
  `getUserConsents` (`valid`, unexpired) and a source resourceId linked through
  consentId/relatedConsents. Empty complete reads clear the flag; partial or
  failed reads preserve prior state unless a positive connection is proved.
  Terminal consent webhooks rediscover all consents so another bank remains
  connected. Browser return never sets the DB flag.
- Trial consent-link creation requires owner-authorized OPEN_BANKING plan
  terms and a saved card via OpenBankingEnrollmentService. Verified discovery
  arms that pending enrollment; existing paid/complimentary owners retain
  access. PREPARE recovery runs daily at 02:45 (original trial plus seven-day
  recovery window), using existing read-only provider endpoints; errors are
  isolated per user. Source discovery itself persists flag/source metadata.
- Pending provider work: when a paid downgrade to a plan without OPEN_BANKING
  becomes effective, or subscription cancellation takes effect, revoke provider consents through the explicit owner/admin disconnection flow. Automatic subscription-triggered provider cancellation is not implemented; stopping local access does not stop provider cost.
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

## Optional spouse Feezback identity (2026-10-15)

The existing primary identity remains Firebase UID + _sub. Only explicit checkbox selection creates a consent link for UID + _sub_spouse. The final enrollment redirect reads server connection-options and offers the unchecked choice if hasOpenBanking OR hasSpouseFeezbackIdentity. It also covers direct page navigation and saved-card resumes.

Only a spouse data-ready webhook plus provider verification of a valid, unexpired consent linked to a source writes user.hasSpouseFeezbackIdentity=true. Profile writes and browser redirects cannot set it. The historical flag survives consent expiry. Known identities participate in discovery and sync; connection state is aggregated, with partial failures unable to clear prior state. Source.connectionRole stores primary/spouse identity once; sync and cached transactions reference the permanent Source.id through sourceRecordId. Account labels have no spouse suffix. Individual retries resolve the owned source ID and role to the appropriate SUB. Opaque normalized transaction IDs retain their deterministic _spouse suffix for import idempotency. No additional identity mapping table is used.

Apply the appended user-column SQL in docs/redesign/cutover.sql before deployment. No production or live provider operations are part of validation.

## Consent termination and full disconnection (2026-10-22)

`GET /feezback/disconnection-targets` and `POST /feezback/disconnect` use Firebase authentication without subscription gating so customers can revoke after losing module entitlement. Only the owner or a server-verified administrator actor may operate; accountant delegation is insufficient. Optional firebaseId targets require verifying the real actor as admin. POST accepts scope all or consent, with consentId + connectionRole for a single permission.

The disconnection service probes both primary/spouse identities with withInvalid=true, including pending spouse onboarding before its historical flag is set (only a FeezbackHttpError GET 404 attributed to the exact owned consent-list pathname proves an absent identity; token-endpoint and unattributed errors remain uncertain), includes pending/suspended/unknown statuses, terminates provider-owned consents through authenticated DELETE with reason=clientDisconnectedFromDigital, and verifies fresh consent state before reporting success. Failed reads, failed DELETEs and asynchronous termination remain partial/pending. hasOpenBanking follows current valid provider consent/source proof; uncertainty preserves prior state. A complete absence of nonterminal permissions clears it. The historical spouse identity flag is preserved. Only a verified full disconnection clears the pending consent-initiation timestamp; partial/single cancellation leaves unrelated onboarding state intact. No automatic billing cancellation or fee guarantee is implied.

Only sync-state consent pointers are cleared after verified termination, including stale pointers on an already-terminal retry. Shared sources are first rebound to a remaining valid, unexpired permission through metadata-only upserts. Discovery only prepopulates retry pointers from provider-verified valid sources, using copied source metadata with a verified valid/unexpired direct consent or the first valid related consent (raw provider diagnostics are unchanged), so a late data-ready webhook cannot restore terminal consent IDs. Source rows and IDs, account/card bill mappings, slim transaction classifications, rules and approved expenses are retained; normal 03:00 cache cleanup remains unchanged. Reconnection uses permanent source identity keys rather than provider consent/resource IDs.

Discovery and disconnection share a per-user in-process operation queue to prevent an older discovery from overwriting a completed termination. Later webhooks still require fresh provider proof. This queue is not a cross-process lock; multi-instance consistency remains subject to provider propagation and the existing discovery architecture. Tests use mocks only; no live provider, database or application startup is required.

Synthetic open-banking demo profiles are rejected with SYNTHETIC_OPEN_BANKING before provider reads, source reads or connection-flag writes, preserving their demo connection state.

Disconnection previews return safe read diagnostics (`operation`, `stage`, optional `httpStatus`, and identity role), never provider messages, URLs, bodies or credentials. An absent-identity 404 is accepted only for the exact configured API origin and consent-list path, including the proxy base-path prefix; token, wrong-origin, wrong-path and other-owner failures remain uncertain. The preview includes provider-linked accounts/cards not yet stored locally, with `sourceRecordId: null`, masked labels and a provider resource key; these are preview-only and never create Source rows or participate in sync-pointer rebinding.
