## Purpose

Small shared authentication-navigation primitives.

## Key entities/files

- `default-authenticated-route.ts` is the single post-auth destination constant.
- `firebase-auth-persistence.ts` configures browser auth persistence.

## Main flows

- Guards and login/referral pages must reuse these helpers instead of embedding
  competing redirect destinations or persistence policies.

## Related topics

- `frontend/src/app/shared/guard/AGENTS.md`
- `frontend/src/app/pages/login/AGENTS.md`
