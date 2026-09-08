## Purpose

Authenticated landing page where a referred user reviews and accepts or
declines an accountant/client referral relationship.

## Key entities/files

- `referral-consent.page.ts` loads the invitation code, displays referral info,
  confirms consent and returns to the default authenticated route.

## Main flows

- Invalid/expired codes show an error and must not create delegation access.
- Acceptance is an authorization-changing action; preserve explicit user
  consent and server-side ownership validation.

## Related topics

- `backend/src/delegation/AGENTS.md`
- `frontend/src/app/shared/guard/AGENTS.md`
