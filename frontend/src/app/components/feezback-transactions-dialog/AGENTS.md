## Purpose

Displays Feezback transaction retrieval details/status within the open-banking
management experience.

## Key entities/files

- `feezback-transactions-dialog.component.ts` loads and presents source/account
  transaction data for the selected context.

## Main flows

- Preserve authenticated user/business scope and do not expose provider tokens
  or raw sensitive payloads in UI errors/logs.
- Provider contract, consent and production callback changes require explicit
  approval.

## Related topics

- `backend/src/feezback/AGENTS.md`
- `frontend/src/app/shared/trans-management/AGENTS.md`
- `frontend/src/app/pages/transactions/AGENTS.md`
