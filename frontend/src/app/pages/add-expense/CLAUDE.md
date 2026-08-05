## Purpose
Standalone page exposing a reactive form for entering an expense's fields (supplier, amounts, category, dates, etc.).

## Key entities/files
- `add-expense.component.ts` — standalone `AddExpenseComponent`; builds `addExpenseForm` via `FormBuilder` from `ExpenseFormColumns`, adds a required `businessNumber` control when the user has `MULTI_BUSINESS` status.
- `add-expense.component.html` — the form layout (text/date/select inputs bound to the form controls).

## Main flows
- Load the logged-in user's data (`AuthService.getUserDataFromLocalStorage`) and initialize the form (`initForm`).
- Show a business-selector field only for multi-business users.

## Related topics
- Depends on `AuthService` (frontend `shared`/core) and shared input components (`InputTextComponent`, `InputDateComponent`, `InputSelectComponent`).
- Routed standalone at `/add-expense` in `app-routing.module.ts` — not embedded in any other page module.

**Flag:** This page builds a form but has no submit handler, no service injection for saving, and no HTTP call — the form's data goes nowhere. It looks like leftover/incomplete work; the actual "add expense" flow used elsewhere in the app goes through the `modal-add-expenses` shared component instead. Worth confirming with the team whether this route is dead code.
