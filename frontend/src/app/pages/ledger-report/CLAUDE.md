## Purpose
Page for viewing the general ledger (כרטסת) — per-account movement listing with opening/closing balances — for a business and period, with PDF/Excel export and a manual journal-entry modal (UI scaffold).

## Key entities/files
- `ledger-report.page.ts` — business/account/period filter form (via `FilterTabComponent`), renders one or more account "cards" with lines, opening balance and totals; PDF export (hidden-iframe print) and Excel export (`exceljs`); journal-entry detail modal (view full entry behind a ledger line); manual journal-entry modal — fully wired to `POST bookkeeping/manual-journal-entries` (atomic batch). Since Phase 4.5 of the categories redesign: the account dropdown is business-scoped and grouped by accounting section, and the old free-text תת-קטגוריה input was replaced by an optional sub_category picker (fed by `GET bookkeeping/expense-catalog`) + a free-text "פירוט" (description) field.
- `ledger-report.service.ts` — HTTP calls: `getLedgerReportData`, `getLedgerAccounts(businessNumber?)` (filter chart — business-scoped since Phase 6.4: SYSTEM + the business's CLIENT chart + its agents' ACCOUNTANT charts; the page reloads it whenever the filter's business changes and clears an account pick that left the scope), `getLedgerEntryAccounts(businessNumber)` (posting accounts + section fields for the manual entry modal), `getExpenseCatalog(businessNumber)` (sub_category picker items), `getJournalEntryDetail`, `createManualJournalEntries`, `getVatReportingPeriods`. Defines `ILedgerReport`/`ILedgerAccountOption`/`IExpenseCatalogItem`/`ILedgerLine`/`IJournalEntryDetail` shapes.
- `ledger-report.module.ts` / `ledger-report-routing.module.ts` — module wiring, routed at `/ledger-report`.

## Main flows
- Choose business, optional account filter ("all accounts" default), and reporting period; submit to load the ledger report (clears the shown report on any filter change until re-submitted).
- View per-account movement rows with debit/credit/balance and tax/VAT breakdown; click a row to open its full journal-entry detail.
- Export the currently loaded report to PDF or XLSX.
- Open the manual journal-entry modal to add one or more entry cards (kind, date, account grouped by section, optional sub_category, פירוט, amounts, VAT period) and save them atomically via `bookkeeping/manual-journal-entries`.

## Related topics
Backend: reports, bookkeeping
Frontend pages: reports (dashboard card links here)
Frontend shared: category-management (imports `LedgerReportService` directly to reuse the ledger-export Excel pattern)
