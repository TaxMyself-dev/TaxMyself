## Purpose

Mandatory Firebase TOTP enrollment surface used before a first-factor-only
user may enter protected Keepintax functionality.

## Key entities/files

- `mfa-setup.page.ts` starts Firebase TOTP enrollment, verifies the six-digit
  code and signs the enrollment session out after success.
- `mfa-setup.page.html` presents the Firebase-generated secret for manual entry
  in a compatible authenticator app. The secret is never sent to Keepintax's
  backend or stored by the application.
- `../../services/mfa.service.ts` owns Firebase MFA SDK calls and session-state
  classification.

## Main flows

- The route is Firebase-authenticated but deliberately outside the protected
  app shell, because the user does not yet have second-factor proof.
- A signed-out or already-enrolled-but-unverified session returns to `/login`;
  an already verified session goes to `/my-account`.
- Successful enrollment signs out. The user must sign in again and prove the
  newly enrolled factor before profile/business data is loaded.
- Production rollout requires TOTP to be enabled in the matching Firebase
  Authentication with Identity Platform project before `requireMfa` and the
  backend `AUTH_MFA_REQUIRED` flag are enabled.

## Related topics

- `frontend/src/app/pages/login/AGENTS.md`
- `frontend/src/app/shared/guard/AGENTS.md`
- `backend/src/guards/AGENTS.md`
