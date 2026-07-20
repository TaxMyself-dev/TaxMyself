## Purpose
Routed pre-flight review page ("confirm expenses"): reviews recognized bank/card transactions and extracted documents — three row types (matched/doc-only/tx-only) — before they become expenses, ahead of the VAT or P&L report being shown. Replaces the old `app-report-review-dialog` overlay popup.

## Key entities/files
- `report-review.page.ts` — `ReportReviewPage`. Reads `businessNumber`/`startDate`/`endDate`/`returnTo` from query params on `ngOnInit`, loads the preview + expense catalog, and drives bulk-select-and-approve, inline category/sub-category/card/period classification, supplier-conflict resolution, D8 annual-document triage, tx↔doc linking, and duplicate detection — all carried over unchanged from the old dialog. `onClose()` navigates back to `returnTo` (`'vat-report'` | `'pnl-report'`, default `'vat-report'`) with `businessNumber`/`startDate`/`endDate`/`reviewed=1` query params so the caller can refresh its report without the user re-submitting the filter form.
- `report-review.page.html` / `.scss` — page layout (was a `p-dialog`; now a plain page wrapper). Inner workflow sub-dialogs (custom period, supplier conflicts, mapping completion, simple picker) remain `p-dialog`s.
- `report-review.module.ts` / `-routing.module.ts` — Angular module wiring, routed at `/report-review`; imports `ButtonComponent`, `GenericTableComponent`, PrimeNG Dialog/Tooltip.
- Row actions: delete (`deleteRow`/`rejectTx`), archive (`archiveDoc`, doc-backed rows only), show-doc (`openPreview`, only when `driveFileId` is present), edit (`toggleEditRow` unlocks the row's classification `<select>`s, which start disabled; the four change handlers set `row.edited = true` once a field actually changes, driving a pencil "edited" marker next to the supplier name).

## Main flows
- Landed on from `vat-report-journal`/`pnl-report-journal`'s `onSubmit` pre-flight (`reportReviewService.previewCheck`) when there are pending docs or unconfirmed expenses and the user accepts the "review now?" prompt.
- Bulk-approve selected rows, or resolve each row individually (edit classification, archive, delete, link a tx to an existing doc, upload a new doc for a tx-only row, file/re-kind D8 annual documents).
- Auto-navigates back to the caller once the row list is empty (nothing left to review).

## Related topics
- Frontend pages: vat-report-journal, pnl-report-journal (both navigate here and read the `reviewed` return param to refresh).
- Backend: reports (report-review preview/approve/archive/delete/link endpoints via `ReportReviewService`).
