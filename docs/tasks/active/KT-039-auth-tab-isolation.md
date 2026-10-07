# KT-039 - Isolate browser-tab identities and harden admin routes

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary integration manager
- Worker: Codex primary agent
- Worktree: `C:/Users/harel/.codex/worktrees/kt039/taxmyself-dev`
- Branch: `codex/kt-039-auth-tab-isolation`
- Base commit: `61080d14fe33c58a203cecabb30671449f008b66`

## Business outcome

An administrator and a client can use separate tabs/windows in the same browser
profile without overwriting each other's cached identity or business context,
and administrative routes reject non-admin callers on both the UI and API
boundaries.

## Acceptance criteria

- [x] Cached `userData` and `businesses` are isolated per browser tab and tied
      to the Firebase UID that owns them.
- [x] A login, logout, refresh, Google login, and admin/accountant client-view
      flow cannot reuse another identity's cached profile.
- [x] `/admin-panel` has an authenticated admin-only frontend route guard.
- [x] The identified legacy admin/development endpoints are removed or guarded
      server-side: `transactions/get-trans`, `finsite/finsite-connect`, and
      `auth/dev/drive/create-folder/:userId`.
- [x] Focused frontend/backend tests cover cross-tab cache isolation and
      non-admin rejection; frontend and backend production builds pass.
- [x] Relevant auth/guard/admin topic documentation reflects the invariant.

## Scope and constraints

- In scope: browser storage used for authenticated identity/business context;
  frontend admin routing; server authorization of the three identified routes;
  focused regression tests and topic docs.
- Out of scope: Firebase credential persistence policy, delegation scope
  redesign, database/schema/data changes, deployment, unrelated endpoint
  cleanup.
- Required reading: root `AGENTS.md`; `frontend/src/app/shared/auth/AGENTS.md`;
  `frontend/src/app/shared/guard/AGENTS.md`; `frontend/src/app/pages/admin-panel/AGENTS.md`;
  `backend/src/guards/AGENTS.md`; relevant controller topic docs.
- Approval boundaries: user explicitly approved beginning the exact identity
  isolation and authorization hardening described in the preceding diagnosis.
  Any wider authentication/security-policy change requires renewed approval.

## Handoff

- Result: Browser identity/profile and business caches now follow Firebase's
  tab boundary, the admin route has a cold-start-safe UI guard, and all three
  identified legacy endpoints require Firebase authentication plus AdminGuard.
- Commit hash(es): this task commit (recorded by Git at delivery).
- Changed files: frontend auth storage/service/login/business cache/admin guard
  and route; backend transactions/finsite/users guards and module wiring;
  focused tests, test tsconfig, task record, and affected topic AGENTS files.
- Tests and exact results:
  - Frontend focused Karma/ChromeHeadless: 8/8 passed.
  - Backend Jest endpoint + AdminGuard security suites: 11/11 passed.
  - Backend production build: passed.
  - Frontend production build: passed (existing bundle/style warnings only).
  - Frontend development build: passed.
- Known pre-existing failures: the repository-wide frontend test discovery
  compiles unrelated legacy specs and fails on their existing TypeScript/test
  issues; focused tests use `tsconfig.auth-spec.json` plus `--include`.
- Schema / production / security / accounting / external impact: no schema,
  data, accounting, or external-service change. Security boundary is stricter;
  three legacy endpoints now return 401/403 unless the persisted actor is admin.
- Risks and manual checks: recommended post-deploy smoke test is two same-browser
  tabs (admin and client) plus direct non-admin requests to the three endpoints.
- Documentation updated: frontend shared auth/guards/login/admin-panel and
  backend guards/transactions/finsite/users topic AGENTS files.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
