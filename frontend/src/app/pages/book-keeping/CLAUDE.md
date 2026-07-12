## Purpose
Container page + tab shell for day-to-day bookkeeping: issued documents (incomes), expenses, clients, suppliers, and (currently hidden) tasks — each a lazy-loaded child route/module under `book-keeping/`.

## Key entities/files
- `book-keeping.page.ts` — `BookKeepingPage`; renders a `TabMenu` of child routes, filtered by feature access (`AccessService.getFeatureState` for `DOCUMENTS_LIST_TAB` / `EXPENSES_LIST_TAB`), and tracks the active tab from the current URL.
- `book-keeping-routing.module.ts` — lazy-loads child modules: `incomes`, `expenses`, `clients`, `suppliers`, `tasks` (client-tasks); `incomes`/`expenses` are gated by `ModuleAccessGuard`.
- `incomes/incomes.page.ts` — `IncomesPage`: lists issued documents (invoices/receipts), handles allocation-number ("מספר הקצאה") entry flow, links to Israeli Tax Authority allocation request page. Uses `DocumentsService`.
- `expenses/expenses.page.ts` — `ExpensesPage`: lists/manages P&L and annual-report-only expenses, file attachments. Uses `ExpenseDataService`, `FilesService`.
- `clients/clients.page.ts` — `ClientsPage`: lists/edits/deletes the business's own clients (used for invoicing), via `DocCreateService.getClients/deleteClient` and the shared `AddClientComponent` dialog.
- `suppliers/suppliers.page.ts` — `SuppliersPage`: lists/edits suppliers via `ExpenseDataService` and the shared `AddSupplierComponent` dialog.
- `client-tasks/client-tasks.page.ts` — `ClientTasksPage` (route `tasks`, tab currently hidden in `book-keeping.page.ts`): shows the user's own report workflows (VAT/advance-tax/annual), lets self-served users mark/dismiss/file, or delegated users confirm upload-completion to their accountant. Uses `ReportWorkflowService`.

## Main flows
- Tab navigation between incomes/expenses/clients/suppliers (tasks hidden), each tab lazy-loaded as its own module/route.
- Incomes: list documents, request/enter Tax Authority allocation numbers for invoices pending allocation.
- Expenses: list/filter expenses, split between regular and annual-report-only.
- Clients/Suppliers: simple CRUD lists backing invoice/expense creation elsewhere.
- Client tasks (when enabled): confirm data upload to accountant, self-mark VAT/advance-tax/annual reports as filed, view stored report PDFs.

## Related topics
- Backend `documents` (incomes/`DocumentsService`), `expenses` (expenses & suppliers/`ExpenseDataService`), `clients` (clients tab), `report-workflow` (client-tasks tab).
- Frontend `doc-create` — `clients.page.ts` uses `DocCreateService` to fetch/delete clients (the client list feeds document creation).
- Frontend shared `add-supplier`, `add-bill`/`AddClientComponent` (dialogs opened from these list pages).
- Gated by `AppFeature`/`AppRoute` access-control (`ModuleAccessGuard`, `AccessService`) — ties into `billing` module plans.
