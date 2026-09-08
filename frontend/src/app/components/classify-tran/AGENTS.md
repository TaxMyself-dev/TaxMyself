## Purpose

Classifies a linked bank/card transaction once or creates a reusable matching
rule.

## Key entities/files

- `classify-tran.component.ts` loads category defaults, builds the classification
  request, and handles overwrite/report-lock responses.

## Main flows

- One-time classification affects one transaction; rule mode may backfill
  eligible matching transactions.
- Submitted-report locks are immutable. Override confirmations may resolve a
  one-time/rule conflict but must never bypass a reporting lock.
- VAT, tax, recognition and equipment fields are accounting behavior governed
  by the redesign plan.

## Related topics

- `backend/src/transactions/AGENTS.md`
- `frontend/src/app/pages/transactions/AGENTS.md`
