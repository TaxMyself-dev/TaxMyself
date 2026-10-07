## Purpose

Handles CardCom payment-method replacement for an existing Keepintax
subscription.

## Key entities/files

- `change-payment-method-dialog.component.ts` starts the hosted CardCom flow,
  tracks pending/return state and refreshes subscription/payment details.

## Main flows
- KT-053: the saved output fires only on backend-verified SUCCESS; trial
  banking enrollment uses it to continue to Feezback. returnToEnrollment tags
  hosted fallback so the dashboard resumes that flow after verified card save.
  The existing token-only provider contract is unchanged and never charges.

- Card details remain on CardCom; Keepintax receives only provider tokens and
  status through approved backend flows.
- Treat redirects and webhooks as asynchronous. Do not infer success solely
  from browser return state.
- CardCom contract, credentials, callbacks and live payment behavior are
  external-service changes requiring explicit approval.

## Related topics

- `backend/src/billing/AGENTS.md`
- `frontend/src/app/pages/billing/AGENTS.md`
- `docs/features/billing/cardcom-billing.md`
