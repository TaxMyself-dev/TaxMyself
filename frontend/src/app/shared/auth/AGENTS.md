## Purpose

Small shared authentication-navigation primitives.

## Key entities/files

- `default-authenticated-route.ts` is the single post-auth destination constant.
- `firebase-auth-persistence.ts` configures browser auth persistence.
- `identity-session-storage.service.ts` stores the real signed-in profile and
  effective-context businesses in tab-scoped `sessionStorage` envelopes. Every
  value is bound to the restored Firebase UID (or represented-client context),
  and legacy shared `localStorage` identity values are purged.

## Main flows

- Guards and login/referral pages must reuse these helpers instead of embedding
  competing redirect destinations or persistence policies.
- Authenticated identity/business caches must never be written to
  `localStorage`: concurrent administrator/client tabs share it and would
  overwrite each other's UI identity.
- `StartupService.whenReady()` revalidates the real owner's profile once per
  browser/app load, even when the tab cache exists. `AuthService.refreshOwnerProfile`
  uses a bounded no-cache `auth/signin` read without `freshLogin` and explicitly
  omits represented-client/business headers through `OWNER_PROFILE_REQUEST`.
  Delegation markers and the represented profile overlay are preserved. Only a
  matching current Firebase UID and the latest request may update the owner cache;
  outages retain the existing cache/session. Successful owner writes publish
  `ownerProfileUpdates$` for retained page instances.

## Related topics

- `frontend/src/app/shared/guard/AGENTS.md`
- `frontend/src/app/pages/login/AGENTS.md`
