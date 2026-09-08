## Purpose

Primary manual expense create/edit dialog, including OCR-assisted values,
supplier defaults, equipment, VAT periods, files and foreign currency.

## Key entities/files

- `mannual-expense.component.ts` owns form hydration, validation, save/update,
  duplicate confirmation, attachment lifecycle and VAT-period selection.
- `mannual-expense.service.ts` calls expense endpoints.
- `expense-currency.util.ts` maps original currency/amount and ILS amount between
  API records and form payloads.

## Main flows

- Edit hydration must preserve the original foreign currency and original
  amount. `sum`/ILS conversion and `originalSum` are not interchangeable.
- Currency/date/original-amount changes must recompute or fetch conversion
  consistently before save; journal/report updates must receive the final ILS
  amount.
- Equipment, VAT, tax, recognition and reporting-period changes cross into
  bookkeeping/report behavior; follow the redesign plan and relevant tests.
- Duplicate override is an explicit second save; cancelled/failed uploads must
  preserve cleanup and retry behavior.

## Related topics

- `backend/src/expenses/AGENTS.md`
- `backend/src/bookkeeping/AGENTS.md`
- `backend/src/shared/AGENTS.md`
