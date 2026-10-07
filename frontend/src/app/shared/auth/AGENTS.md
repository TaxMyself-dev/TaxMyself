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

## Related topics

- `frontend/src/app/shared/guard/AGENTS.md`
- `frontend/src/app/pages/login/AGENTS.md`
