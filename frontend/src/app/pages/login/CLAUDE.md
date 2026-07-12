## Purpose
Login page handling email/password and Google sign-in via Firebase, backend session sync, and password-reset / email-verification flows.

## Key entities/files
- `login.page.ts` — login form (email/password) and reset-password form; Firebase auth (`AngularFireAuth`) sign-in, Google sign-in popup, resend-verification-email with cooldown timer, forgot-password email; on success loads businesses and navigates to `my-account`.
- `login.module.ts` / `login-routing.module.ts` — module wiring, routed at `/login`.

## Main flows
- Email/password login: Firebase `signInWithEmailAndPassword` → verify email → `AuthService.signIn(true)` (backend sync, `freshLogin=true`) → store user data → `GenericService.loadBusinessesFromServer()` → navigate to `/my-account`.
- Google sign-in: `AuthService.signInWithGoogle()`; if the account doesn't exist yet, shows a "not registered" warning and signs the ghost Firebase user out.
- Resend verification email (60s cooldown) and forgot-password email, both via `AuthService`.
- Shows a "registered successfully" modal when navigated here from the register page (via router state).

## Related topics
Backend: auth, users
Frontend pages: my-account (post-login destination), register (source of the "registered" modal state)
Frontend shared: none
