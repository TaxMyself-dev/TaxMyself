## Purpose
Main transactions ledger: lists income and expense bank/card transactions, lets the user classify/reclassify them into categories, associate unlinked accounts to bills, and tracks background bank/card sync status.

## Key entities/files
- `transactions.page.ts` — `TransactionsPage`. Large page component: income/expense tables (via `GenericTableComponent`), filter panel, account-association dialog, add-bill dialog, classify-transaction dialog, add-category dialog, sync-status polling.
- `transactions.page.service.ts` — `TransactionsService` (root-provided, also consumed by other pages e.g. pnl-report-journal/vat-report-journal/settings). Endpoints: `transactions/get-transaction-to-confirm-and-add-to-expenses`, `transactions/get-trans-to-classify`, `transactions/get-incomes`, `transactions/get-expenses`, plus bill/account/category lookups (`getAllBills`, `getSourcesWithTypes` etc.) and `categoryListRefreshTrigger` signal for cross-component dropdown refresh.
- `transactions.page.html` / `.scss` — dual income/expense tables, filter panel, dialogs (account-association, add-bill, classify-tran, add-category).
- `transactions.module.ts` / `-routing.module.ts` — Angular module wiring; imports `TopNavComponent`, `ImageBunnerComponent`, `GenericTableComponent`, `AccountAssociationDialogComponent`, `AddBillComponent`, `ClassifyTranComponent`, `AddCategoryComponent`, `FilterPanelComponent`.

## Main flows

- DirectCardNoticeComponent is also mounted on the cashflow page, active under
  ordinary Angular routing (root uses router-outlet, not ion-router-outlet).
  It waits for consent dialogs/running sync and is suppressed in view-as mode.
  Its save uses the existing cashflowPreferencesChanged$ refresh subscription.
- A verified disconnected effective profile shows the same yellow banking
  banner above the income/expense tables. Owner CTA repeats the feature gate,
  requires explicit consent, then uses `/billing/open-banking`; represented
  clients see information only. Owner cache updates and Ionic reentry refresh
  connection state; selected-client identity must match before using its flag.
- A known disconnected profile clears retained browser rows/filters, cancels
  pending reads and stops sync polling before showing
  "אין נתונים כי אין חיבור לבנקאות פתוחה". Old local filter/search state cannot
  replace that explanation. Reconnection resumes polling. Connected, unknown,
  loading, sync-failed and transaction-read-failed states retain their existing
  presentation; connected filter/search-empty states keep the default copy.

- Both tables pass `expenseRowActions`/`incomeRowActions` through the unified
  `actions` input. Desktop/mobile availability uses the same account-association
  and canManageExpenses/confirmed predicates; loading actions cannot execute.
- `ngOnInit`: loads user data, starts `SyncStatusService` polling (`startSyncStatusPolling` — running/completed/failed/error state machine that gates when data may be fetched), loads bills and categories.
- `getTransactions`/`getExpensesData`/`handleTableData`: fetch and shape income/expense rows into `IRowDataTable[]` for the generic table, with column sets built via `buildTransactionColumns` (varies by `businessStatus` single/multi and `isOnlyEmployer`).
- Row actions per table (`expenseRowActions`/`incomeRowActions`): "שייך לחשבון" (`onAssociateAccount`, only for rows with no billName), "סיווג תנועה" (`onClassifyTransaction`, opens classify dialog), "סיווג מהיר" (`onQuickClassify`, one-click classify).
- Dialog open/close pairs: account-association, add-bill, classify-tran, add-category — each toggles a `visible*` signal and refetches affected data on close.
- Bill/account lookup failures never create placeholder rows in `accountsList`; an empty collection lets account selectors show their dedicated empty-state copy and remain retryable.
- Filtering: `applyFilters`/`resetFilters`/`classifyDataFilter` plus a document-click listener (`onDocumentClick`) that closes the filter panel when clicking outside it or outside PrimeNG overlay panels.
- Sync-status polling drives `syncProcessStatus` signal consumed by `GenericTableComponent` to show running/failed banners over the table.

## Related topics

Represented clients can classify unconfirmed transactions even when rows carry
`canManageExpenses: false`. Classification actions remain hidden for confirmed
rows without approval authority. The backend checks both permissions and
confirmed state independently.
- Backend: transactions (all core endpoints), expenses (confirm-to-expense flow), bookkeeping (category/subcategory data feeding classify dialogs).
- Frontend pages: pnl-report-journal, vat-report-journal, settings — all inject `TransactionsService` from this directory for confirm/classify/account-source operations.
- Frontend shared: add-bill, add-transaction, trans-management, category-management-adjacent dialogs (add-category, classify-tran), account-association-dialog.


## Direct-card cashflow update (2026-11-04)

This section supersedes earlier bank-only / skipped_direct descriptions. Direct
cards now import through the ordinary card feed and retain readiness/consent/error
checks. New outcomes are success/failed, with legacy skipped outcomes retried.
The owner's persisted opt-in preference excludes only owned bank-source rows
classified to the immutable SYSTEM subcategory identified by
DIRECT_CARD_BANK_PAYMENT; no per-row visibility flag or name matching. One SQL
predicate serves cashflow lists/charts, pending archives/previews and approval
guards. Existing approved expenses/journals are preserved. Settings stores the
preference on the server; the cashflow list can explicitly show excluded rows.
Apply docs/features/direct-card-cashflow.sql manually before booting this version.
The script is also appended to cutover.sql and has not been executed here.
See docs/features/direct-card-cashflow.md for schema, demo, testing and limits.

## Full sync retry from banking errors (2026-11-04)

Owner-visible OB-03/OB-04 notifications include the action משוך מחדש את כל התנועות. It calls the existing full-sync endpoint after capturing the previous run ID, ignores that run during polling, joins an already-running job, and preserves displayed rows on request failure. The action is disabled while starting/running, hidden for disconnected or represented-client contexts, rechecks eligibility before POST, and cannot execute after its owning page is destroyed. A cleared issue removes its matching notification. No provider, backend, schema or production-data contract changes.
