## Purpose
Manages business expenses (and legacy incomes), the category/sub-category taxonomy (default + per-user overrides) that classifies them, and suppliers — including posting journal entries for each expense into bookkeeping.

## Key entities/files
- `expenses.entity.ts` — `Expense`: supplier, category/subCategory, sum, tax/VAT/reduction percents, business/user linkage, file attachment, `externalTransactionId`/`sourceDocumentId` (links back to a bank transaction or `ExtractedDocument`), original-currency fields, `reportScope` (PNL vs annual), `pnlCategory` override, `journalEntryNumber`.
- `incomes.entity.ts` — `Income`: legacy income record (supplier, sum, date, incomeNumber) — simpler, no VAT/tax breakdown fields.
- `default-categories.entity.ts` / `default-sub-categories.entity.ts` — `DefaultCategory`/`DefaultSubCategory`: system-wide taxonomy with tax/VAT/reduction percent defaults, `isEquipment`, `isRecognized`, `necessity`, `reportScope`, `pnlCategory`, and bookkeeping `accountCode`/`subAccountCode` (populated by `AccountSeedService`).
- `user-categories.entity.ts` / `user-sub-categories.entity.ts` — `UserCategory`/`UserSubCategory`: per-user/business overrides or additions to the default taxonomy, same shape plus `accountCode` override.
- `suppliers.entity.ts` — `Supplier`: per-business supplier records (unique per `businessNumber`+`supplierID`), used to prefill category/tax/VAT defaults on new expenses.
- `expenses.service.ts` — `ExpensesService`: expense CRUD (`addExpense` posts a journal entry via bookkeeping), category/sub-category CRUD and account-code resolution (`resolveAccountCode`, `getPnlCategoryMap`), supplier CRUD, VAT-report/reduction-report queries, drive-review bulk confirm + duplicate-check flows (`bulkConfirmFromDrive`, `checkDuplicateExpensesFromDrive`).
- `expenses.controller.ts` — `ExpensesController` at route `expenses`, gated by `RequireModule(EXPENSES)` + `FirebaseAuthGuard`/`SubscriptionGuard` (default-sub-category admin endpoints use `AdminGuard`/`isAdmin` checks instead).

## Main flows
- `POST /expenses/add-expense` — create an expense; resolves account code, posts a journal entry (debit expense, credit A/P or cash) via `BookkeepingModule`.
- `PATCH /expenses/update-expense/:id`, `DELETE /expenses/delete-expense/:id` — edit/delete an expense, syncing its journal entry.
- `POST /expenses/bulk-confirm-from-drive`, `POST /expenses/check-duplicates-from-drive` — turn reviewed `ExtractedDocument` OCR rows into confirmed expenses, with a pre-flight supplier+sum+date duplicate check.
- `GET /expenses/get_by_userID`, `get-expenses-for-vat-report` — filtered expense listings for the dashboard and VAT reporting.
- Category/sub-category CRUD: `add-user-category`, `add-user-sub-categories`, `get-categories`, `get-sub-categories`, `user-category/:id`, `user-sub-category/:id`, plus admin-only default-sub-category CRUD and `sub-category-report-config` (P&L scope/category override).
- Supplier CRUD: `add-supplier`, `update-supplier/:id`, `delete-supplier/:id`, `get-suppliers-list`, `get-supplier/:id`.
- `PATCH /expenses/add-file-to-expense`, `delete-file-from-expense/:id` — attach/detach receipt files.

## Related topics
- bookkeeping (`BookkeepingModule` — journal entry posting/sync for every expense; `DefaultBookingAccount` chart of accounts referenced by `accountCode`)
- documents (`ExtractedDocument` entity — OCR'd supplier documents confirmed into expenses)
- transactions (`ClassifiedTransactions` — bank transaction classification rules tied to categories)
- business (`Business` entity)
- billing (`BillingModule` — subscription/module gating)
- users (`UsersModule`, `AuthService`, `Child` entity)
- delegation (`Delegation` entity registered in module)
- shared (`SharedModule` — date parsing helpers used by controller)
- cloud (queries `Expense` directly for the "my cloud" search endpoint)
- demo-data (depends on this module: `ExpensesService.addExpense` used to seed demo expenses)
