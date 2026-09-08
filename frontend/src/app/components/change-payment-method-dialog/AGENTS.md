## Purpose

Handles CardCom payment-method replacement for an existing Keepintax
subscription.

## Key entities/files

- `change-payment-method-dialog.component.ts` starts the hosted CardCom flow,
  tracks pending/return state and refreshes subscription/payment details.

## Main flows

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
