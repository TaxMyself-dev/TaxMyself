## Purpose

Associates an imported bank/card payment identifier with an existing or newly
created Keepintax account.

## Key entities/files

- `account-association-dialog.component.ts` loads accounts and calls the
  transactions association API.

## Main flows

- Normalize the external identifier and payment-method type before save.
- A successful association refreshes account data and closes with a result;
  creating a new account delegates to the active `components/add-bill` flow.

## Related topics

- `frontend/src/app/components/add-bill/AGENTS.md`
- `frontend/src/app/pages/transactions/AGENTS.md`
- `backend/src/transactions/AGENTS.md`
