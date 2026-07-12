## Purpose
Owns bank/card transaction ingestion, classification (rule-based and manual), and the slim/cache dual-table model that powers flow analysis, expense confirmation, and report-period locking.

## Key entities/files
- `transactions.entity.ts` (`Transactions`) — legacy monolithic transaction table, being phased out (see `TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS` markers across the codebase).
- `slim-transaction.entity.ts` (`SlimTransaction`) — the classification-relevant subset: category/sub-category, tax%/vat%, `vatReportingDate`, `isLocked` (hard lock once a report is submitted), `matchedDocumentId` (link to an OCR'd document), keyed uniquely on `(userId, externalTransactionId)`.
- `full-transaction-cache.entity.ts` (`FullTransactionCache`) — denormalized read model mirroring slim plus display fields (merchant, amount, currency, `ilsAmount`/`fxRateToIls` for FX conversion).
- `classified-transactions.entity.ts` (`ClassifiedTransactions`) — smart classification rules keyed by merchant with optional comment/sum-range/date-range conditions and deterministic scoring/tie-break precedence.
- `bill.entity.ts` / `source.entity.ts` — `Bill` (a bank/card account, owned by a `User`) has many `Source`s (individual feeds/sync sources).
- `user-sync-state.entity.ts`, `user-source-sync-state.entity.ts`, `user-transaction-cache-state.entity.ts`, `user-sync-state.service.ts` — per-user/per-source Open Banking sync progress and cache-freshness tracking.
- `transaction-processing.service.ts` — `TransactionProcessingService`: ingestion pipeline (`process`), `classifyManually`/`classifyWithRule`, cache invalidation, flow analysis, rule CRUD (`listRulesForUser`/`updateRuleForUser`/`deleteRuleForUser`), scheduled cache cleanup (`handleDailyCacheCleanup`).
- `transactions.service.ts` — `TransactionsService`: legacy + bill/source CRUD, confirm-to-expenses (`saveTransactionsToExpenses`), ledger/report helper queries. Phase 4.6: the dead legacy `classifyTransaction`/`findSubCategoryDetails` were deleted (the live classify path is `TransactionProcessingService.classifyManually`/`classifyWithRule`), and the legacy transactions-table category filter now gets its known-name list from `CatalogService.getCategoryNamesForUser` — this module no longer touches the frozen `default_/user_category` tables.
- `transactions.controller.ts` — REST endpoints under `/transactions`.

## Main flows
- Sync: `triggerSync`/`getSyncStatus`/`retrySource`/`postConsentSync` — Open Banking pull pipeline (via feezback) feeding `process()` → slim + cache tables.
- Classification: `classifyTransaction`/`classifyManually`/`classifyWithRule`/`quickClassifyTransaction` — assigns category/vat%/tax%, optionally creating or applying a `ClassifiedTransactions` rule.
- Confirm to Expense: `saveTransToExpenses`/`saveTransactionsToExpenses` — promotes confirmed slim rows into `Expense` records via `ExpensesService`, stamping `vatReportingDate`.
- Flow analysis: `getFlowAnalysis`/`getFlowAnalysisMerchants` — aggregated cash-flow view over cache rows.
- Reporting-period lock: `isLocked` (set by report-workflow / reports "mark submitted") blocks further reclassification via the guard in `TransactionProcessingService`.

## Related topics
Depends on: shared (`FxRateService` for `ilsAmount`, `SharedService`), expenses (`ExpensesService`), users, business, delegation, documents (`ExtractedDocument` for `matchedDocumentId`), feezback (Open Banking sync source), billing, bookkeeping. Depended on by: reports, report-workflow, shared (legacy `getRepository` case for `Transactions`), documents.
