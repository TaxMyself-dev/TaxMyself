## Purpose

Active account/card creation panel used from transaction and association flows.

## Key entities/files

- `add-bill.component.ts` selects business scope, validates account data,
  submits through `TransactionsService`, and refreshes the account list.

## Main flows

- Multi-business users must select an authorized business; single-business
  users inherit their active scope.
- Timeout/uncertain responses must not blindly resubmit a possibly successful
  creation. Recheck the account list first.

## Related topics

- `frontend/src/app/components/account-association-dialog/AGENTS.md`
- `backend/src/transactions/AGENTS.md`
