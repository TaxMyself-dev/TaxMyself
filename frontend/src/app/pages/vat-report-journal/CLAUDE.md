## Purpose
Renders and manages the periodic VAT ("מע\"מ") report: fetches VAT figures for a business/period, lets the user attach supporting files to expense line items, mark the report as submitted, and export a PDF.

## Key entities/files
- `vat-report-journal.page.ts` — `VatReportJournalPage`. Filter form (business + period), pre-flight review gate (same pattern as P&L), per-expense file attach/preview/delete, VAT report rendering, mark-as-submitted, PDF export.
- `vat-report-journal.service.ts` — `VatReportJournalService`. HTTP calls: `GET reports/vat-report-journal`, `GET reports/vat-report-pdf` (blob), `PATCH expenses/add-file-to-expense`, `PATCH expenses/delete-file-from-expense/:id`, `POST reports/mark-submitted`, `GET reports/submission-status`.
- `vat-report-journal.page.html` / `.scss` — report layout, expense table with file column, confirm dialogs.
- `vat-report-journal.module.ts` / `-routing.module.ts` — Angular module wiring; imports `FilterTabComponent`, `PeriodSelectComponent`, `GenericTableComponent`, `ButtonComponent`, PrimeNG Dialog/ConfirmDialog.

## Main flows
- Select business + period → `onSubmit` runs `reportReviewService.previewCheck` → proceeds directly or, when there are pending docs/unconfirmed expenses, prompts the user and (on accept) navigates to the `/report-review` page (`returnTo: 'vat-report'`), same pre-flight pattern as pnl-report-journal. `ngOnInit` detects a `reviewed` query param on return and re-fetches the report for the carried-back business/period.
- Legacy fallback: `getTransToConfirm`/`confirmTrans` via `TransactionsService` to confirm pending expense transactions before the report renders.
- `getVatReportData` / `getDataTable` fetch the VAT figures and the expense line-item table; `getReportSubmissionStatus` runs alongside to drive the submitted-state badge.
- Per-row file handling: `beforeSelectFile`/`addFile`/`onFileChange`/`addFileToExpense`/`onDeleteFile`/`onDownloadFile`/`onPreviewFileClicked` manage attaching, previewing, downloading, and deleting supporting documents on individual expense rows.
- `onMarkAsSubmitted` locks all transactions in the period after a confirm dialog (`reports/mark-submitted`).
- `exportToPdf` requests the pdfkit-rendered VAT report PDF (with expense breakdown) and downloads it via `FilesService`.

## Related topics
- Backend: reports (vat-report-journal, vat-report-pdf, mark-submitted, submission-status), expenses (add-file-to-expense, delete-file-from-expense), transactions.
- Frontend pages: transactions (via `TransactionsService`), pnl-report-journal (near-identical review/submit/PDF pattern — likely worth keeping in sync), report-review (routed pre-flight review page, replaces the old in-page dialog).
- Frontend shared: filter-tab / period-select / generic-table / button components.
