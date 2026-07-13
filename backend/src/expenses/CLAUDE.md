## Purpose
Manages business expenses (and legacy incomes), the category/sub-category taxonomy (default + per-user overrides) that classifies them, and suppliers — including posting journal entries for each expense into bookkeeping.

## Key entities/files
- `expenses.entity.ts` — `Expense`: supplier, category/subCategory, sum, tax/VAT/reduction percents, business/user linkage, file attachment, `externalTransactionId`/`sourceDocumentId` (links back to a bank transaction or `ExtractedDocument`), original-currency fields, `reportScope` (PNL vs annual), `pnlCategory` override, `journalEntryNumber`.
- `incomes.entity.ts` — `Income`: legacy income record (supplier, sum, date, incomeNumber) — simpler, no VAT/tax breakdown fields.
- `default-categories.entity.ts` / `default-sub-categories.entity.ts` / `user-categories.entity.ts` / `user-sub-categories.entity.ts` — the OLD four-table taxonomy. **Frozen read-only since Phase 2.5, fully UNREFERENCED at runtime since Phase 4.6** — no service injects their repos anymore; they remain only in `app.module.ts`'s `forRoot` entities list so the tables stay schema-managed for rollback until the Phase 7 drop. Replaced by `bookkeeping`'s `Category`/`SubCategory`/`BookingAccount`/`AccountingSection`.
- `suppliers.entity.ts` — `Supplier`: per-business supplier records (unique per `businessNumber`+`supplierID`), used to prefill category/tax/VAT defaults on new expenses.
- `expenses.service.ts` — `ExpensesService`: expense CRUD on the NEW catalog model (Phase 4.1: every write path funnels through `resolveExpenseClassification`/`applyClassificationToExpense` — subCategoryId preferred, name-pair fallback — writing FK + section/account/6111 snapshots + D7 `description` + `approvalStatus` together; `addExpense` posts the journal entry in the same transaction only when journalable; `deleteExpense` removes the journal entry in the same transaction, Phase 4.3b; the D10 period lock `assertExpensePeriodUnlocked` throws 423 `expense_period_locked` on edits/reclassifications/deletes of reported periods), reclassification endpoints (`reclassifyExpense`/`overrideExpenseMapping`, Phase 4.2, stamping `classificationOverrideByUserId`), category/sub-category CRUD (ported to `CatalogService` in Phase 2.4; response shapes mapped back to the legacy `categoryName`/`subCategoryName` field names via `toLegacyCategory`/`toLegacySubCategory`), supplier CRUD, VAT-report/reduction-report queries, drive-review bulk confirm + duplicate-check flows. The old `resolveAccountCode` adapter and `getPnlCategoryMap` are DELETED (Phase 4.6/4.4) — unmappable classifications are rejected with 400, never silently posted to 60000.
- `expenses.controller.ts` — `ExpensesController` at route `expenses`, gated by `RequireModule(EXPENSES)` + `FirebaseAuthGuard`/`SubscriptionGuard`. The SYSTEM-catalog admin endpoints (`get-all-default-sub-categories`, `update/add/delete-default-sub-category`) check `isAdmin` against `actorFirebaseId` (the caller's OWN identity — Phase 5.1): an admin browsing while impersonating a client passes, an accountant impersonating a client is refused (D11: only platform admins edit SYSTEM rows).
- Phase 5.1: every catalog resolution/merge in `ExpensesService` goes through a delegation-aware `CatalogContext` (`CatalogContextService.forUser`) so the client's accountant-layer (`ACCOUNTANT_<agentId>`) catalog rows and cards are visible in classification, category/sub-category reads, and override-mapping account lookups.
- Phase 5.3 (D5/D9): `CreateUserSubCategoryDto.deferToAccountant` saves a sub_category unmapped (`MISSING_ACCOUNTING_MAPPING`, no law/card) — allowed only when the client has an ACTIVE delegation (otherwise 400; an unaccompanied client picks a mapping via the D9 simple picker). `POST /expenses/:id/complete-mapping` (`completeExpenseMapping`) is the D9 inline-completion primitive: `applyToFuture=false` → one-off snapshot override (the 4.2 path); `true` → `repointSubCategoryAccount` (future expenses follow) + `reclassifyExpense` onto the effective row — approve + journal in one tx, actor-stamped.
- Phase 6.2 (D5 three-option flow): `CreateUserSubCategoryDto` also carries `isPrivate` (option 1 — no card, never journaled; wins over every other mapping field) and `accountId` (the D9 simple-picker card choice, scope-checked via `CatalogService.findAccountByIdInScope` — 400 when the card isn't visible to the business). `CreateUserCategoryDto.defaultRecognitionType` is a UI hint stamped on the created category (never consulted by law resolution); `toLegacyCategory` exposes it.

## Main flows
- `POST /expenses/add-expense` — create an expense; resolves account code, posts a journal entry (debit expense, credit A/P or cash) via `BookkeepingModule`.
- `PATCH /expenses/update-expense/:id`, `DELETE /expenses/delete-expense/:id` — edit/delete an expense, syncing its journal entry.
- `POST /expenses/bulk-confirm-from-drive`, `POST /expenses/check-duplicates-from-drive` — turn reviewed `ExtractedDocument` OCR rows into confirmed expenses, with a pre-flight supplier+sum+date duplicate check.
- `GET /expenses/get_by_userID`, `get-expenses-for-vat-report` — filtered expense listings for the dashboard and VAT reporting.
- Category/sub-category CRUD: `add-user-category`, `add-user-sub-categories`, `get-categories`, `get-sub-categories`, `user-category/:id`, `user-sub-category/:id`, plus admin-only default-sub-category CRUD and `sub-category-report-config` (P&L scope/category override).
- Supplier CRUD: `add-supplier`, `update-supplier/:id`, `delete-supplier/:id`, `get-suppliers-list`, `get-supplier/:id`.
- `PATCH /expenses/add-file-to-expense`, `delete-file-from-expense/:id` — attach/detach receipt files.

## Related topics
- bookkeeping (`BookkeepingModule` — journal entry posting/sync for every expense; `CatalogService` now also backs this module's category/sub-category CRUD, not just account-code resolution)
- documents (`ExtractedDocument` entity — OCR'd supplier documents confirmed into expenses)
- transactions (`ClassifiedTransactions` — bank transaction classification rules tied to categories)
- business (`Business` entity)
- billing (`BillingModule` — subscription/module gating)
- users (`UsersModule`, `AuthService`, `Child` entity)
- delegation (`Delegation` entity registered in module)
- shared (`SharedModule` — date parsing helpers used by controller)
- cloud (queries `Expense` directly for the "my cloud" search endpoint)
- demo-data (depends on this module: `ExpensesService.addExpense` used to seed demo expenses)
