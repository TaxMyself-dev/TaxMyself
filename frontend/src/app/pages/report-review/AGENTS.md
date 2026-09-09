## Purpose

Routed pre-flight review page for extracted documents and bank/card
transactions before they become expenses. It handles `matched`, `doc_only`,
and `tx_only` rows and replaces the former overlay review dialog.

## Key entities/files

- `report-review.page.ts` owns query context, row loading, selection, row
  actions, duplicate handling, linking and approval orchestration.
- `report-review.page.html` renders the table and delegates editing to
  `app-report-review-edit-dialog`.
- `report-review.module.ts` and `report-review-routing.module.ts` expose the
  `/report-review` route.
- `src/app/services/report-review.service.ts` calls the backend preview,
  persistent edit, link, approve, archive and reject endpoints.

## Main flows

- VAT/P&L pre-flight enters with business and period query parameters; archive
  approval may add `focusDocumentId` to load exactly one pending document.
- Editing opens `ReportReviewEditDialogComponent`. Save is blocking and
  persistent: document-owned fields use `updateDocFields`; transaction-owned
  fields use `updateTxFields`. A successful response updates the local row
  before the dialog closes.
- Matched-row classification follows the backend ownership rules. Supplier
  cascade and account/category changes must remain synchronized with approve
  payloads; do not reintroduce display-only inline edits.
- Foreign-currency document rows retain `originalCurrency` and `originalSum`;
  ILS conversion is a distinct value and must not replace the original amount.
- Bulk approval dispatches by row kind to matched, document-cash, or
  transaction-without-document endpoints. Duplicate conflicts require explicit
  user confirmation before retry.
- When no rows remain, navigation returns to the caller and marks the review as
  completed so the report/archive can refresh.
- The preview response carries `canManageExpenses`. Represented owners and
  read-only delegates retain preview/file viewing but do not receive edit,
  classify, reject, link, supplier-management, selection, or approval actions;
  backend `EXPENSES_APPROVE` checks remain authoritative.

## Related topics

- `frontend/src/app/components/report-review-edit-dialog/AGENTS.md`
- `frontend/src/app/pages/vat-report-journal/AGENTS.md`
- `frontend/src/app/pages/pnl-report-journal/AGENTS.md`
- `backend/src/reports/AGENTS.md`
- `backend/src/expenses/AGENTS.md`
