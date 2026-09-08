## Purpose

Presentation component for editing one report-review row. It exposes field
changes and save intent while the parent page owns persistence.

## Key entities/files

- `report-review-edit-dialog.component.ts` defines `ExpenseEditFieldValues`,
  inputs, field-change outputs and validation/display helpers.
- `.html` and `.scss` define regular/professional layouts.

## Main flows

- Never call persistence APIs from this component. Emit changes to
  `ReportReviewPage`, which chooses document/transaction ownership and waits for
  the server before closing.
- Preserve separate original-currency/original-amount and ILS display values.
- Keep field visibility aligned with row kind and regular/professional mode.

## Related topics

- `frontend/src/app/pages/report-review/AGENTS.md`
- `backend/src/reports/AGENTS.md`
