## Purpose

Central Angular route gates for authentication, startup, billing, module
entitlements, referral consent, offline navigation and view-only delegation.

## Key entities/files

- `auth.guard.ts` and `login-page.guard.ts` handle auth entry.
- `auth.guard.ts`, `login-page.guard.ts` and `startup-redirect.guard.ts` share
  the MFA state rules. When `environment.requireMfa=true`, unenrolled users go
  to `/mfa/setup`, sessions awaiting a second factor stay on `/login`, and only
  sessions whose ID token contains second-factor proof enter protected routes.
- `admin-route.guard.ts` keeps non-admin profiles out of `/admin-panel`; backend
  `AdminGuard` remains the authoritative security boundary.
- `accountant-route.guard.ts` keeps regular profiles out of `/client-panel`, allowing only the real ACCOUNTANT/ADMIN identity; the delegation endpoint repeats the role check server-side.
- `startup-redirect.guard.ts` resolves the post-login destination.
- `billing.guard.ts` and `module-access.guard.ts` enforce subscription/module
  access while preserving approved admin impersonation behavior.
- `referral-consent.guard.ts`, `offline-navigation.guard.ts` and
  `view-only-block-doc.guard.ts` protect specialized flows.

## Main flows

- Keep redirect decisions deterministic and reuse the shared authenticated
  default route.
- The app-shell `canActivateChild` includes `AuthGuard`, so legacy child routes
  that omitted a route-local auth guard are still covered by the global MFA
  gate. Public registration, login, MFA setup and SHAAM callback routes remain
  outside that shell.
- UI guards improve navigation but never replace backend authorization.
- View-as document creation is allowed only for a real `ADMIN` operating a
  backend-verified demo profile (`isDemo=true`); admins on real clients and
  non-admin users on demos remain blocked.
- Auth, delegation or entitlement-policy changes require explicit approval.

## Related topics

- `frontend/src/app/shared/auth/AGENTS.md`
- `backend/src/billing/AGENTS.md`
- `backend/src/delegation/AGENTS.md`
