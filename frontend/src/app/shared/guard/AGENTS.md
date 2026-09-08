## Purpose

Central Angular route gates for authentication, startup, billing, module
entitlements, referral consent, offline navigation and view-only delegation.

## Key entities/files

- `auth.guard.ts` and `login-page.guard.ts` handle auth entry.
- `startup-redirect.guard.ts` resolves the post-login destination.
- `billing.guard.ts` and `module-access.guard.ts` enforce subscription/module
  access while preserving approved admin impersonation behavior.
- `referral-consent.guard.ts`, `offline-navigation.guard.ts` and
  `view-only-block-doc.guard.ts` protect specialized flows.

## Main flows

- Keep redirect decisions deterministic and reuse the shared authenticated
  default route.
- UI guards improve navigation but never replace backend authorization.
- Auth, delegation or entitlement-policy changes require explicit approval.

## Related topics

- `frontend/src/app/shared/auth/AGENTS.md`
- `backend/src/billing/AGENTS.md`
- `backend/src/delegation/AGENTS.md`
