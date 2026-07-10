## Purpose
Page for viewing the general ledger (כרטסת) — per-account movement listing with opening/closing balances — for a business and period, with PDF/Excel export and a manual journal-entry modal (UI scaffold).

## Key entities/files
- `ledger-report.page.ts` — business/account/period filter form (via `FilterTabComponent`), renders one or more account "cards" with lines, opening balance and totals; PDF export (hidden-iframe print) and Excel export (`exceljs`); journal-entry detail modal (view full entry behind a ledger line); manual journal-entry modal (form scaffold only — `saveJournalEntry()` currently just logs, no API call yet).
- `ledger-report.service.ts` — HTTP calls to backend `reports` module: `getLedgerReportData`, `getLedgerAccounts` (full chart of accounts for the filter), `getLedgerEntryAccounts` (posting-only accounts for the manual entry modal), `getJournalEntryDetail`. Defines `ILedgerReport`/`ILedgerAccount`/`ILedgerLine`/`IJournalEntryDetail` shapes.
- `ledger-report.module.ts` / `ledger-report-routing.module.ts` — module wiring, routed at `/ledger-report`.

## Main flows
- Choose business, optional account filter ("all accounts" default), and reporting period; submit to load the ledger report (clears the shown report on any filter change until re-submitted).
- View per-account movement rows with debit/credit/balance and tax/VAT breakdown; click a row to open its full journal-entry detail.
- Export the currently loaded report to PDF or XLSX.
- Open a manual journal-entry modal to add/remove lines and enter debit/credit — not yet wired to a save API (scaffold only).

## Related topics
Backend: reports, bookkeeping
Frontend pages: reports (dashboard card links here)
Frontend shared: category-management (imports `LedgerReportService` directly to reuse the ledger-export Excel pattern)
