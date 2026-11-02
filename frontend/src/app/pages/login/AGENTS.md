## Purpose
Login page handling email/password and Google sign-in via Firebase, SMS
second-factor challenges, backend session sync, and password-reset /
email-verification flows.

## Key entities/files
- `login.page.ts` — login form (email/password) and reset-password form;
  Firebase email/Google first-factor sign-in; SMS challenge completion;
  resend-verification-email with cooldown timer; forgot-password email; on
  success loads businesses and navigates to `my-account`.
- `../../services/mfa.service.ts` — classifies the current Firebase MFA session,
  enrolls a phone factor through Firebase reCAPTCHA/SMS and resolves Firebase
  multi-factor sign-in errors.
- `login.module.ts` / `login-routing.module.ts` — module wiring, routed at `/login`.

## Main flows
- Email/password login: Firebase `signInWithEmailAndPassword` → verify email → `AuthService.signIn(true)` (backend sync, `freshLogin=true`) → store user data in the current tab's UID-bound session cache → `GenericService.loadBusinessesFromServer()` → navigate to `/my-account`.
- Email/password and Google login never write authenticated profile/business
  state to shared `localStorage`; this permits different identities in separate
  browser tabs without cross-tab role/menu contamination.
- Google sign-in: `AuthService.signInWithGoogle()`; if the account doesn't exist yet, shows a "not registered" warning and signs the ghost Firebase user out.
- When `environment.requireMfa` is enabled, an authenticated user without an
  enrolled factor is sent to `/mfa/setup` before any protected backend/profile
  request. Enrollment signs the first-factor-only session out; the next email
  or Google login must complete the SMS challenge and receive Firebase's
  `sign_in_second_factor` claim.
- Resend verification email (60s cooldown) and forgot-password email, both via `AuthService`.
- Shows a "registered successfully" modal when navigated here from the register page (via router state).

## Related topics
Backend: auth, users
Frontend pages: my-account (post-login destination), register (source of the "registered" modal state)
Frontend shared: none
