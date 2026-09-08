## Purpose
Not an active module — this directory holds only a legacy Firebase service-account credentials file. Actual request authentication/authorization is implemented in `src/guards/` and `src/users/`, not here.

## Key entities/files
- `firebaseServiceAccount-prod.json` — a Firebase Admin SDK service-account key file. Not imported anywhere in `src` (confirmed via search); Firebase Admin is actually initialized in `app.module.ts` from `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` env vars. This file appears to be dead/unused and, since it's a credentials file, its presence in the repo is worth flagging.

## Main flows
None — no controller, service, or module in this directory.

Real auth logic lives elsewhere:
- `src/guards/firebase-auth.guard.ts` (`FirebaseAuthGuard`) — verifies the Firebase ID token, resolves `request.user`, and handles accountant-acting-as-client via `x-client-user-id` + `Delegation` lookup (or admin bypass).
- `src/guards/admin.guard.ts`, `src/guards/subscription.guard.ts` — role/subscription gating.
- `src/users/auth.service.ts` — a mostly-empty `AuthService` stub wrapping `admin.auth()`, registered in `UsersModule`.

## Related topics
None (directory has no code that imports/is imported by other topics). Related functionality actually lives in guards (not a listed topic) and users.
