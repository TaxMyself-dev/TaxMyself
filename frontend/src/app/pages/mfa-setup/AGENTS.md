## Purpose

Mandatory Firebase SMS enrollment surface used before a first-factor-only
user may enter protected Keepintax functionality.

## Key entities/files

- `mfa-setup.page.ts` normalizes an Israeli/E.164 phone number, starts Firebase
  SMS enrollment through an invisible reCAPTCHA, verifies the six-digit code
  and signs the enrollment session out after success.
- `mfa-setup.page.html` obtains explicit consent before the number is sent
  directly to Firebase/Google. Keepintax's backend does not receive or store
  the phone number.
- `../../services/mfa.service.ts` owns Firebase MFA SDK calls and session-state
  classification.

## Main flows

- The route is Firebase-authenticated but deliberately outside the protected
  app shell, because the user does not yet have second-factor proof.
- A signed-out or already-enrolled-but-unverified session returns to `/login`;
  an already verified session goes to `/my-account`.
- Successful enrollment signs out. The user must sign in again and prove the
  newly enrolled factor before profile/business data is loaded.
- Production rollout requires SMS MFA, an allow-only SMS region policy and the
  application's authorized domains to be configured in the matching Firebase
  Authentication with Identity Platform project before `requireMfa` and the
  backend `AUTH_MFA_REQUIRED` flag are enabled. The Firebase project must have
  Cloud Billing linked for SMS delivery.

## Related topics

- `frontend/src/app/pages/login/AGENTS.md`
- `frontend/src/app/shared/guard/AGENTS.md`
- `backend/src/guards/AGENTS.md`
