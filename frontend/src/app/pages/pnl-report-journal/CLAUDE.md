## Purpose
Renders the profit-and-loss (P&L) report for a business/period: fetches income + categorized expenses from the backend, lets the user tweak income and apply the "עוסק זעיר" (small-trader) 30% flat deduction, and exports a server-rendered PDF.

## Key entities/files
- `pnl-report-journal.page.ts` — `PnLReportJournalPage`. Filter form (business + period via `app-filter-tab`), pre-flight review gate, report rendering, osek-zair toggle, mark-as-submitted, PDF export.
- `pnl-report-journal.service.ts` — `PnLReportJournalService`. HTTP calls: `GET reports/pnl-report-journal`, `GET reports/pnl-report-pdf` (blob), `PATCH expenses/add-file-to-expense`, `POST reports/mark-submitted`, `GET reports/submission-status`.
- `pnl-report-journal.page.html` / `.scss` — report layout, osek-zair checkbox, unconfirmed-expenses redirect dialog, review-dialog integration, loading states.
- `pnl-report-journal.module.ts` / `-routing.module.ts` — Angular module wiring (non-standalone page); imports `ReportReviewDialogComponent`, `FilterTabComponent`, `PeriodSelectComponent`, `ButtonComponent`, PrimeNG Dialog/ConfirmDialog/Checkbox.
- Note: this directory has substantial uncommitted in-progress changes (module/html/scss/ts/service all touched) — this doc reflects the current on-disk state, not the last commit.

## Main flows
- Select business + period (`app-filter-tab`) → `onSubmit` runs `reportReviewService.previewCheck` (cheap pending-docs/unconfirmed-expenses check) → either proceeds straight to the report or opens the unified `app-report-review-dialog`.
- Fallback legacy path: `getTransToConfirm` / `confirmTrans` against `TransactionsService` for confirming pending expense transactions before rendering the report (redirect-prompt dialog if the user cancels with items still pending).
- `getPnLReportData` fetches income/expenses and, in parallel, `getReportSubmissionStatus` to drive the "סמן כדווח" vs "הדוח הוגש" badge.
- "עוסק זעיר" checkbox (`onOsekZairToggle`) re-fetches the report so the backend recomputes the flat 30% deduction; manual income edits (`updateIncome`) recompute the same 30% locally to stay in sync without a re-fetch.
- `onMarkAsSubmitted` locks all transactions in the period (`reports/mark-submitted`) after a confirm dialog.
- `createPnlReportPDFfile` requests a pdfkit-rendered PDF from the backend (optionally with a manual income override) and downloads it via `FilesService`.

## Related topics
- Backend: reports (pnl-report-journal, pnl-report-pdf, mark-submitted, submission-status endpoints), expenses (add-file-to-expense), transactions (confirm-to-expense flow via TransactionsService).
- Frontend pages: transactions (via `TransactionsService` for `getTransToConfirm`/`addTransToExpense`).
- Frontend shared: report-review-dialog (`app-report-review-dialog`, used as the unified pre-flight review), filter-tab / period-select / button components.
