## Purpose
Page listing the user's stored expenses (with attached receipt files) for a selectable period/business, supporting add/edit/delete and file preview/download.

## Key entities/files
- `my-storage.page.ts` — expense table (via `ExpenseDataService`) filtered by reporting period (annual/monthly/bimonthly/date-range) and business (multi-business support); add/edit expense via `ModalExpensesComponent`; delete expense (also deletes its file from Firebase); preview/download attached file via `FilesService`; two navigation cards ("מסמכים שיצרתי" / "מסמכים שהעלתי") to `/vat-report` and `/pnl-report`.
- `my-storage.module.ts` / `my-storage-routing.module.ts` — module wiring, routed at `/my-storage`.

## Main flows
- Filter stored expenses by reporting period and (if multi-business) business, defaulting to all-time for the primary business.
- Add or edit an expense through the shared add-expense modal (`ExpenseDataService.openModalAddExpense`).
- Delete an expense and its associated Firebase file; preview or download an attached file.
- Filter the visible rows by supplier text.

## Related topics
Backend: expenses
Frontend pages: vat-report-journal (nav card → `/vat-report` route, which loads the `vat-report-journal` module), pnl-report-journal (nav card → `/pnl-report` route, which loads the `pnl-report-journal` module)
Frontend shared: modal-add-expenses (via `ExpenseDataService.openModalAddExpense` → `ModalExpensesComponent`)
