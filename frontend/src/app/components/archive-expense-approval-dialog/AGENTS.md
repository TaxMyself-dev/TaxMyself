## Purpose

Focused approval dialog that turns one pending archive document into an
expense, optionally linked to a transaction.

## Key entities/files

- `archive-expense-approval-dialog.component.ts` loads one document preview,
  captures overrides and calls `approveMatched` or `approveDocCash`.

## Main flows

- Loading is side-effect-free; only the approval action mutates state.
- Duplicate detection requires explicit confirmation before retry.
- Keep override fields and currency/ILS values aligned with the main report
  review flow.

## Related topics

- `frontend/src/app/pages/report-review/AGENTS.md`
- `backend/src/reports/AGENTS.md`
