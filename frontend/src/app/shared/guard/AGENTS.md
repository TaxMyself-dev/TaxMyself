## Purpose

Central Angular route gates for authentication, startup, billing, module
entitlements, referral consent, offline navigation and view-only delegation.

## Key entities/files

- `auth.guard.ts` and `login-page.guard.ts` handle auth entry.
- `admin-route.guard.ts` keeps non-admin profiles out of `/admin-panel`; backend
  `AdminGuard` remains the authoritative security boundary.
- `startup-redirect.guard.ts` resolves the post-login destination.
- `billing.guard.ts` and `module-access.guard.ts` enforce subscription/module
  access while preserving approved admin impersonation behavior.
- `referral-consent.guard.ts`, `offline-navigation.guard.ts` and
  `view-only-block-doc.guard.ts` protect specialized flows.

## Main flows

- Keep redirect decisions deterministic and reuse the shared authenticated
  default route.
- UI guards improve navigation but never replace backend authorization.
- View-as document creation is allowed only for a real `ADMIN` operating a
  backend-verified demo profile (`isDemo=true`); admins on real clients and
  non-admin users on demos remain blocked.
- Auth, delegation or entitlement-policy changes require explicit approval.

## Related topics

- `frontend/src/app/shared/auth/AGENTS.md`
- `backend/src/billing/AGENTS.md`
- `backend/src/delegation/AGENTS.md`
