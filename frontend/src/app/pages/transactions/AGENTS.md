## Purpose
Main transactions ledger: lists income and expense bank/card transactions, lets the user classify/reclassify them into categories, associate unlinked accounts to bills, and tracks background bank/card sync status.

## Key entities/files
- `transactions.page.ts` — `TransactionsPage`. Large page component: income/expense tables (via `GenericTableComponent`), filter panel, account-association dialog, add-bill dialog, classify-transaction dialog, add-category dialog, sync-status polling.
- `transactions.page.service.ts` — `TransactionsService` (root-provided, also consumed by other pages e.g. pnl-report-journal/vat-report-journal/settings). Endpoints: `transactions/get-transaction-to-confirm-and-add-to-expenses`, `transactions/get-trans-to-classify`, `transactions/get-incomes`, `transactions/get-expenses`, plus bill/account/category lookups (`getAllBills`, `getSourcesWithTypes` etc.) and `categoryListRefreshTrigger` signal for cross-component dropdown refresh.
- `transactions.page.html` / `.scss` — dual income/expense tables, filter panel, dialogs (account-association, add-bill, classify-tran, add-category).
- `transactions.module.ts` / `-routing.module.ts` — Angular module wiring; imports `TopNavComponent`, `ImageBunnerComponent`, `GenericTableComponent`, `AccountAssociationDialogComponent`, `AddBillComponent`, `ClassifyTranComponent`, `AddCategoryComponent`, `FilterPanelComponent`.

## Main flows
- `ngOnInit`: loads user data, starts `SyncStatusService` polling (`startSyncStatusPolling` — running/completed/failed/error state machine that gates when data may be fetched), loads bills and categories.
- `getTransactions`/`getExpensesData`/`handleTableData`: fetch and shape income/expense rows into `IRowDataTable[]` for the generic table, with column sets built via `buildTransactionColumns` (varies by `businessStatus` single/multi and `isOnlyEmployer`).
- Row actions per table (`expenseRowActions`/`incomeRowActions`): "שייך לחשבון" (`onAssociateAccount`, only for rows with no billName), "סיווג תנועה" (`onClassifyTransaction`, opens classify dialog), "סיווג מהיר" (`onQuickClassify`, one-click classify).
- Dialog open/close pairs: account-association, add-bill, classify-tran, add-category — each toggles a `visible*` signal and refetches affected data on close.
- Filtering: `applyFilters`/`resetFilters`/`classifyDataFilter` plus a document-click listener (`onDocumentClick`) that closes the filter panel when clicking outside it or outside PrimeNG overlay panels.
- Sync-status polling drives `syncProcessStatus` signal consumed by `GenericTableComponent` to show running/failed banners over the table.

## Related topics
- Backend: transactions (all core endpoints), expenses (confirm-to-expense flow), bookkeeping (category/subcategory data feeding classify dialogs).
- Frontend pages: pnl-report-journal, vat-report-journal, settings — all inject `TransactionsService` from this directory for confirm/classify/account-source operations.
- Frontend shared: add-bill, add-transaction, trans-management, category-management-adjacent dialogs (add-category, classify-tran), account-association-dialog.
