## Purpose

Displays Feezback transaction retrieval details/status within the open-banking
management experience.

## Key entities/files

- `feezback-transactions-dialog.component.ts` submits an admin-selected date
  range, keeps the dialog open after completion, and presents copyable request,
  response, timestamp, persistence-count, and error diagnostics.

## Main flows

- The admin-only diagnostic shows raw Feezback transaction payloads and upstream
  errors intentionally, but never authentication headers/tokens or server file
  paths. Sent/received timestamps are rendered in the Israel time zone.
- Provider contract, consent and production callback changes require explicit
  approval.

## Related topics

- `backend/src/feezback/AGENTS.md`
- `frontend/src/app/shared/trans-management/AGENTS.md`
- `frontend/src/app/pages/transactions/AGENTS.md`
