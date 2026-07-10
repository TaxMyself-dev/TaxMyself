## Purpose
Admin-only screen for maintaining the global list of default sub-categories (the master categorization rules — tax %, VAT %, depreciation %, recognized/expense flags — that back every user's expense/income categories). Also exports/imports that list as Excel.

## Key entities/files
- `category-management.component.ts` — signal-based state (`subCategories`, filters, add/edit dialog state); CRUD against `ExpenseDataService` (`getAllDefaultSubCategories`/`addDefaultSubCategory`/`updateDefaultSubCategory`/`deleteDefaultSubCategory`); Excel export built with `exceljs`.
- `category-management.component.html` — `app-filter-tab` filter bar, results table, add/edit `p-dialog`s, `app-load-file` for bulk upload (`load-default-categories` endpoint).
- `category-management.component.scss` — styling.

## Main flows
- Load and filter default sub-categories (by category, isExpense, isRecognized, reportScope, isEquipment).
- Add a sub-category (pick existing parent category or create a new one).
- Edit / delete a sub-category (PrimeNG `ConfirmationService` confirm dialogs).
- Bulk-import sub-categories from an uploaded file.
- Export all sub-categories to a 3-sheet Excel workbook (recognized / not-recognized / accountant view), using `LedgerReportService.getLedgerAccounts()` to resolve account names for the accountant sheet.

## Related topics
- Backend: expenses (default-sub-category CRUD via `ExpenseDataService`)
- Frontend pages: admin-panel (embeds `<app-category-management>`), ledger-report (`LedgerReportService.getLedgerAccounts` used only for the Excel export's account-name lookup)
