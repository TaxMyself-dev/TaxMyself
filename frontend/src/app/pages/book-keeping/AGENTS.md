## Purpose
Container page + tab shell for day-to-day bookkeeping: issued documents (incomes), expenses, clients, suppliers, and (currently hidden) tasks — each a lazy-loaded child route/module under `book-keeping/`.

## Key entities/files
- `book-keeping.page.ts` — `BookKeepingPage`; renders a `TabMenu` of child routes, filtered by feature access (`AccessService.getFeatureState` for `DOCUMENTS_LIST_TAB` / `EXPENSES_LIST_TAB`), and tracks the active tab from the current URL.
- `book-keeping-routing.module.ts` — lazy-loads child modules: `incomes`, `expenses`, `clients`, `suppliers`, `archived-documents`, `tasks` (client-tasks); `incomes`/`expenses` are gated by `ModuleAccessGuard`.
- `incomes/incomes.page.ts` — `IncomesPage`: lists issued documents (invoices/receipts), supports client-side free-text search across the displayed document fields, handles allocation-number ("מספר הקצאה") entry flow, and links to the Israeli Tax Authority allocation request page. Uses `DocumentsService`.
- `expenses/expenses.page.ts` — `ExpensesPage`: lists/manages P&L and annual-report-only expenses and file attachments by document date (independent of VAT claim periods), with client-side free-text search in both expense tables. An asset acquisition appears only in its acquisition-date range while generated depreciation remains journal-only. Its formatted table amount is display-only; it retains a separate raw ILS amount for edit prefill, while the manual-expense dialog prefills foreign rows from `originalSum`/`originalCurrency` and sends those source values back for server-side conversion. Fixed assets expose both the statutory depreciation rate and the separate income-tax recognition percentage. Uses `ExpenseDataService`, `FilesService`.
- `clients/clients.page.ts` — `ClientsPage`: lists/edits/deletes the business's own clients (used for invoicing), via `DocCreateService.getClients/deleteClient` and the shared `AddClientComponent` dialog.
- `suppliers/suppliers.page.ts` — `SuppliersPage`: lists/edits suppliers via `ExpenseDataService` and the shared `AddSupplierComponent` dialog.
- `archived-documents/archived-documents.page.ts` — unified document/expense archive with client-side free-text search that composes with status and document-type filters. Deleted Drive documents are hidden by default, visible through the deleted-status filter, previewable, and manually restorable; delete/restore are file-scoped and preserve accounting history.
- `client-tasks/client-tasks.page.ts` — `ClientTasksPage` (route `tasks`, tab currently hidden in `book-keeping.page.ts`): shows the user's own report workflows (VAT/advance-tax/annual), lets self-served users mark/dismiss/file, or delegated users confirm upload-completion to their accountant. Uses `ReportWorkflowService`.

## Main flows
- Tab navigation between incomes/expenses/clients/suppliers (tasks hidden), each tab lazy-loaded as its own module/route.
- Incomes: list documents, request/enter Tax Authority allocation numbers for invoices pending allocation.
- Expenses: list/filter expenses, split between regular and annual-report-only.
- Clients/Suppliers: simple CRUD lists backing invoice/expense creation elsewhere.
- Archive: filter/preview Drive documents and transaction-only expenses; soft-delete or restore Drive documents without deleting their retained file.
- Client tasks (when enabled): confirm data upload to accountant, self-mark VAT/advance-tax/annual reports as filed, view stored report PDFs.

- Expense edit/delete/file actions follow server-provided
  `canManageExpenses`. In the archive an authorized accountant can edit and
  explicitly approve pending manual expenses; represented owners see the
  pending item without edit/approval actions.

## Related topics
- Backend `documents` (incomes/`DocumentsService`), `expenses` (expenses & suppliers/`ExpenseDataService`), `clients` (clients tab), `report-workflow` (client-tasks tab).
- Frontend `doc-create` — `clients.page.ts` uses `DocCreateService` to fetch/delete clients (the client list feeds document creation).
- Frontend shared `add-supplier`, `add-bill`/`AddClientComponent` (dialogs opened from these list pages).
- Gated by `AppFeature`/`AppRoute` access-control (`ModuleAccessGuard`, `AccessService`) — ties into `billing` module plans.
