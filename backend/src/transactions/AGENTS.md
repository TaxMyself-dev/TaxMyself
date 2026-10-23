## Purpose
Owns bank/card transaction ingestion, classification (rule-based and manual), and the slim/cache dual-table model that powers flow analysis, expense confirmation, and report-period locking.

## Key entities/files
- `transactions.entity.ts` (`Transactions`) — legacy monolithic transaction table, being phased out (see `TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS` markers across the codebase).
- `slim-transaction.entity.ts` (`SlimTransaction`) — the classification-relevant subset: category/sub-category, tax%/vat%, `vatReportingDate`, `isLocked` (hard lock once a report is submitted), `matchedDocumentId` (link to an OCR'd document), plus a minimal merchant/date/amount/currency snapshot that keeps pending archive rows usable after the nightly cache clear; keyed uniquely on `(userId, externalTransactionId)`.
- `full-transaction-cache.entity.ts` (`FullTransactionCache`) — denormalized read model mirroring slim plus display fields (merchant, amount, currency, `ilsAmount`/`fxRateToIls` for FX conversion).
- `classified-transactions.entity.ts` (`ClassifiedTransactions`) — smart classification rules keyed by merchant with optional comment/sum-range/date-range conditions and deterministic scoring/tie-break precedence.
- `bill.entity.ts` / `source.entity.ts` — `Bill` (a bank/card account, owned by a `User`) has many `Source`s (individual feeds/sync sources). `Source.isDirect` (nullable bool, cards only): true = Direct/Debit card — Feezback returns no balances for it and its card-feed transactions are intentionally NOT imported (they arrive via the bank feed); written only from a successful cards+balances fetch, never guessed.
- Per-source sync status (`user_source_sync_state.status`, varchar): `not_synced` / `success` / `failed` / `skipped_direct`. `skipped_direct` is terminal-by-design for Direct cards — excluded from login/auto retry selection, preserved across consent revocation (`clearConsentOnSources`) and admin cache clears (`markSyncEmpty`).
- Nightly cache cleanup (`runDailyCacheCleanup`) skips demo users, detected with `isDemoEmail()` from `demo-data/profiles` (a pure function over the static profile registry — no module dependency). Demo transactions are seeded, not synced, so deleting their cache and flipping `user_sync_state` to `empty` would permanently break the account: there is no Feezback consent behind it for a login sync to refill.
- `user-sync-state.entity.ts`, `user-source-sync-state.entity.ts`, `user-transaction-cache-state.entity.ts`, `user-sync-state.service.ts` — per-user/per-source Open Banking sync progress and cache-freshness tracking.
- `transaction-processing.service.ts` — `TransactionProcessingService`: ingestion pipeline (`process`), `classifyManually`/`classifyWithRule`, cache invalidation, flow analysis, rule CRUD (`listRulesForUser`/`updateRuleForUser`/`deleteRuleForUser`), scheduled cache cleanup (`handleDailyCacheCleanup`).
- `transactions.service.ts` — `TransactionsService`: legacy + bill/source CRUD, confirm-to-expenses (`saveTransactionsToExpenses`), ledger/report helper queries. Phase 4.6: the dead legacy `classifyTransaction`/`findSubCategoryDetails` were deleted (the live classify path is `TransactionProcessingService.classifyManually`/`classifyWithRule`), and the legacy transactions-table category filter now gets its known-name list from `CatalogService.getCategoryNamesForUser` — this module no longer touches the frozen `default_/user_category` tables.
- `transactions.controller.ts` — REST endpoints under `/transactions`.

## Main flows
- Sync: `triggerSync`/`getSyncStatus`/`retrySource`/`postConsentSync` — Open Banking pull pipeline (via Feezback) feeding `process()` → slim + cache tables. The retired Finsite ingestion path and its endpoint have been removed.
- Manual full-sync and per-source retry reject `syntheticOpenBanking` demo profiles before any Feezback call; those profiles are restored only from their versioned fixture.
- Provider deduplication runs at the `process()` boundary before persistence. Feezback V2 rows with different transaction IDs but the same `(paymentIdentifier, aspspOriginalId)` collapse to one row, preferring the V1-compatible variant without `entryReference`; no business-field heuristic is used when provider provenance is absent.
- Classification: `classifyTransaction`/`classifyManually`/`classifyWithRule`/`quickClassifyTransaction` — assigns category/vat%/tax%, optionally creating or applying a `ClassifiedTransactions` rule.
- Confirm to Expense: `saveTransToExpenses`/`saveTransactionsToExpenses` — promotes confirmed slim rows into `Expense` records via `ExpensesService`, stamping `vatReportingDate`.
- Flow analysis: `getFlowAnalysis`/`getFlowAnalysisMerchants` — aggregated cash-flow view over cache rows.
- Reporting-period lock: `isLocked` (set by report-workflow / reports "mark submitted") blocks further reclassification via the guard in `TransactionProcessingService`.

- Confirm-to-expense is an `EXPENSES_APPROVE` operation. It stamps approved
  expense rows with VAT/annual periods and the real approving actor; a
  represented owner's direct confirmation request is rejected.

## Empty-cache recovery invariants

- Nightly cleanup resets the full sync outcome together with
  `fullProcessStatus='empty'`: result, row count, timestamps, failure reason
  and skip reason must not describe data that was just removed.
- `POST /transactions/admin/sync-if-empty/:firebaseId` is an admin-only
  view-as preparation hook. It starts a login-style sync only for missing or
  `empty` state, reuses an in-flight sync, and never refreshes a completed
  cache merely because an admin opened the client.

## Related topics

Authorization invariant: classification and quick classification retain
`EXPENSES_APPROVE` for delegated accountants, but a represented owner may
classify unconfirmed transactions in their own session. Owner-created rules
skip confirmed transactions during backfill. Reclassification of confirmed
transactions, transaction edits, rule mutation endpoints, and
confirm-to-expense require `EXPENSES_APPROVE`; the latter remains the explicit
accountant approval step. Read responses carry `canManageExpenses` so the UI
can distinguish approval authority from classification access; the backend
remains authoritative.
Depends on: shared (`FxRateService` for `ilsAmount`, `SharedService`), expenses (`ExpensesService`), users, business, delegation, documents (`ExtractedDocument` for `matchedDocumentId`), feezback (Open Banking sync source), billing, bookkeeping. Depended on by: reports, report-workflow, shared (legacy `getRepository` case for `Transactions`), documents.

## Disconnected payment sources
DELETE /transactions/sources/:sourceRecordId uses FirebaseAuthGuard and effective user ownership. A transaction locks the owned source and its sync state, refuses any nonempty consentId with SOURCE_HAS_ACTIVE_CONSENT (409), detaches historical cache references, deletes sync metadata, then deletes only that source. Bills, slim transactions, cache history, expenses and provider consents are retained. No schema changes or provider API calls. Settings sources include records without a sync state.

## Consent rotation during an in-flight pull

For existing sync rows, updateSourceResults writes outcome fields only. Discovery
owns consent/resource rotation. Results with older identifiers are ignored; an
atomic identifier predicate prevents a pull finishing after termination or
reconnection from resurrecting old consent metadata. Permanent sources, bill
associations, classifications, rules, slim rows and approved expenses are retained.
Reconnection and empty-cache rebuild regression tests cover stable source IDs,
identity/currency separation, one-time classifications and confirmed states.

## Verified provider disconnection cache removal

Feezback's disconnection service now deletes only temporary cache rows after authoritative verification. Partial termination targets owned permanent Source IDs, excluding any source covered by another nonterminal permission; uncertain/ambiguous scopes are retained. Full verified absence of all permissions clears the user's entire temporary cache (including legacy rows with no Source ID), cache freshness and full-sync transient outcome fields. Slim classifications/confirmation, Expenses, rules, Sources and bill associations remain intact for reconnect.

Feezback persistence and cache-state promotions share the per-user queue and pessimistic User row lock with cleanup. They recheck the current connected flag and stable source consent pointers before ingestion, preventing late pulls from restoring disconnected cache. Generic transaction classification/rebuild behavior and nightly cleanup are unchanged.
