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
- AuthGuard implements both CanActivate and CanActivateChild. The child hook
  delegates to the same startup/session/profile/MFA checks; registering a class
  in canActivateChild without that method causes a runtime navigation error.
- View-as document creation is allowed only for a real `ADMIN` operating a
  backend-verified demo profile (`isDemo=true`); admins on real clients and
  non-admin users on demos remain blocked.
- Auth, delegation or entitlement-policy changes require explicit approval.
- Payment-required routing uses `access.isPaymentRequired` plus
  `paymentBlockReason`, not only the persisted subscription status. In
  particular an overdue ACTIVE row is a payment block and must route to payment
  recovery; it must never open the module/plan upgrade dialog. The app-shell
  first calls the provider-free overdue preparation endpoint, refreshes billing
  state to `PAST_DUE`, and only then navigates to `/billing/recovery`. The
  blocking billing dialog contains no unrelated open-banking management action.
- BillingGuard intercepts CardCom checkout return parameters on `/my-account`
  before the dashboard component is created and sends them to
  `/billing/payment-status`. Independently, a server-reported
  `pendingCheckout` owns authenticated navigation after refresh or a later
  login, so the user cannot land on the dashboard or open another payment page
  while the canonical hosted attempt is unresolved. The status route remains
  authenticated but outside BillingGuard so it can perform the owner-scoped
  resolution check.

## Related topics

- `frontend/src/app/shared/auth/AGENTS.md`
- `backend/src/billing/AGENTS.md`
- `backend/src/delegation/AGENTS.md`
