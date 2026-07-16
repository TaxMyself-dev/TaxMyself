## Purpose
Admin-only screen for maintaining the global list of default sub-categories (the master categorization rules — tax %, VAT %, depreciation %, recognized/expense flags — that back every user's expense/income categories). Also exports/imports that list as Excel.

## Key entities/files
- `category-management.component.ts` — signal-based state (`subCategories`, filters, add/edit dialog state); CRUD against `ExpenseDataService` (`getAllDefaultSubCategories`/`addDefaultSubCategory`/`updateDefaultSubCategory`/`deleteDefaultSubCategory`); Excel export built with `exceljs`.
- `category-management.component.html` — `app-filter-tab` filter bar, results table, add/edit `p-dialog`s. The bulk-upload `app-load-file` control (backed by `load-default-categories`) was removed in Phase 2.6 of the categories redesign — that endpoint was deleted, superseded by the flat idempotent seeder (D13).
- `category-management.component.scss` — styling.

## Main flows
- Load and filter default sub-categories (by category, isExpense, isRecognized, reportScope, isEquipment). Since Phase 6.2c the table shows the row's CARD (accountCode - accountName) and חתך (sectionName) — fields the backend's legacy shape now carries — instead of the retired `pnlCategory` string (D3); private rows (D5) show 'פרטית' in the מוכר column.
- Add a sub-category (pick existing parent category or create a new one); percent/recognition fields resolve to a SYSTEM card via the variant-card path (D1/D10) — `pnlCategory` input removed.
- Edit a sub-category: names are read-only (the backend never applied them); law-field edits repoint the row at a matching/new card, never editing a card's percents in place (D10). Delete via confirm dialog (soft delete server-side).
- Export all sub-categories to a 3-sheet Excel workbook (recognized / not-recognized / accountant view) — card name/section/code6111 come straight from the rows; the retired subAccountCode column is gone (D2).

## Related topics
- Backend: expenses (default-sub-category CRUD via `ExpenseDataService`)
- Frontend pages: admin-panel (embeds `<app-category-management>`)
