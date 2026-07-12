## Purpose
Page for reviewing bank/card transactions flagged as recognized expenses for a date range/business, attaching receipt files, and bulk-committing selected transactions into the expenses ledger.

## Key entities/files
- `flow-report.page.ts` — table of transactions (filtered to `isRecognized`), per-row checkbox selection, per-row file attach, "select all" (skips already-reported rows), bulk upload of attached files to Firebase then POST selected transactions to expenses; navigates to `reports` on success.
- `flow-report.page.service.ts` — HTTP calls to backend `transactions` module: `getFlowReportData` (transactions to confirm/add to expenses) and `addTransToExpense`.
- `flow-report.module.ts` / `flow-report-routing.module.ts` — module wiring, routed at `/flow-report` (reads `startDate`/`endDate`/`businessNumber` from query params).

## Main flows
- Load transactions to confirm for a date range + business (multi-business adds a business-name column).
- Select individual or all eligible (non-disabled) rows; attach a receipt file per row.
- Submit: upload attached files via `FilesService`, then post the chosen transaction IDs (with file paths) to `save-trans-to-expenses`; rolls back uploaded files on submission failure.
- Filter the visible table by supplier/name text.

## Related topics
Backend: transactions, expenses
Frontend pages: reports (navigated to after successful submission)
Frontend shared: none
