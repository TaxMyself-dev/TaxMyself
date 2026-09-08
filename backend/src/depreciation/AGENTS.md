## Purpose

Calculates annual depreciation for equipment expenses and materializes the
corresponding bookkeeping postings.

## Key entities/files

- `depreciation-calculation.ts` contains the pure yearly calculation.
- `depreciation.service.ts` creates, refreshes and removes postings.
- `asset-depreciation-posting.entity.ts` makes each expense/year posting
  traceable and idempotent.

## Main flows

- Expense creation materializes the activation year; report preparation fills
  missing years through the requested year.
- Updating or deleting an equipment expense must refresh/remove both posting
  records and their journal entries in one transaction.
- Do not change rates, rounding, journal accounts, or recognition rules without
  reading the accounting redesign plan and obtaining any required approval.

## Related topics

- `backend/src/expenses/AGENTS.md`
- `backend/src/bookkeeping/AGENTS.md`
- `frontend/src/app/pages/depreciation-report/AGENTS.md`
