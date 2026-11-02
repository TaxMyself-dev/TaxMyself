# KT-065 - SHAAM allocation demo profile

- Status: `COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\\Users\\harel\\Elazar Harel\\taxmyself\\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: local branch HEAD plus the uncommitted KT-056 through KT-064 work
  (no commit will be created in this task)

## Business outcome

An administrator can create a dedicated Keepintax demo user for the Tax
Authority invoice-allocation sandbox. The user owns sandbox issuer `777777715`
and opens with a current-date tax-invoice draft above the allocation threshold,
without changing the existing uniform-file fixture.

## Acceptance criteria

- [x] Register a separate demo profile for SHAAM allocation testing.
- [x] Use the Tax Authority's published successful-allocation sandbox issuer
      `777777715` and synthetic customer `515000008`.
- [x] Seed a current-date tax-invoice draft with reconciled net/VAT/gross totals
      above the 2026 allocation threshold.
- [x] Do not issue the document, create a journal entry, call SHAAM or store Tax
      Authority credentials during profile creation.
- [x] Wire the above-threshold document action to the hardened SHAAM OAuth/API
      flow so the demo can exercise the new server-side connection.
- [x] Add focused tests, update documentation and pass backend/frontend builds.

## Scope and constraints

- In scope: demo profile registry, draft fixture support, the existing automatic
  allocation action in the document screen, focused tests and docs.
- Out of scope: live SHAAM calls, OAuth credentials, schema changes, production,
  commit, push and deployment.
- The existing `ledger-test` / `222222226` uniform-file fixture must remain
  unchanged.

## Handoff

- Result: a separate `shaam-allocation-test` profile now creates business
  `777777715` and a strict, current-date tax-invoice draft for customer
  `515000008`. The above-threshold action now enters the hardened server-side
  SHAAM OAuth/allocation path. A failed draft seed fails and cleans up the new
  profile instead of reporting a partial success.
- Commit hash(es): none requested.
- Changed files:
  - `backend/src/demo-data/demo-profile.types.ts`
  - `backend/src/demo-data/profiles/shaam-allocation-test.profile.ts`
  - `backend/src/demo-data/profiles/index.ts`
  - `backend/src/demo-data/demo-data.service.ts`
  - `backend/src/demo-data/demo-data.service.shaam-allocation.spec.ts`
  - `backend/src/demo-data/AGENTS.md`
  - `frontend/src/app/pages/doc-create/doc-create.page.ts`
  - `frontend/src/app/pages/doc-create/AGENTS.md`
  - `docs/tasks/active/KT-065-shaam-allocation-demo-profile.md`
- Tests and exact results: focused Jest passed (2 suites, 10 tests, 0 failed);
  Nest backend build passed; Angular production build passed with the existing
  SCSS/bundle/CommonJS budget warnings; `git diff --check` passed with only two
  existing LF-to-CRLF notices in unrelated previously changed files.
- Known pre-existing failures: Jest reports that open handles require
  `--forceExit`, matching the existing demo-data test harness behavior.
- Schema / production / security / accounting / external impact: no schema or
  production change; no external call. The profile contains synthetic data only.
- Risks and manual checks: no demo user was created in the live dev database and
  no external SHAAM request was made. The user must create the profile from the
  admin screen and complete the OAuth interaction manually with a Tax Authority
  user authorized for the tsandbox flow.
- Documentation updated: demo-data topic map and this task file.

## Integration

- Reviewed by: pending user manual test.
- Integrated commit: none requested.
- Combined verification: focused backend tests and both builds passed locally.
- `origin/main` verification: not applicable.
- User-visible run instructions: create `shaam-allocation-test` from the admin
  demo-data screen, enter it, open document creation, verify the restored draft
  for business `777777715`, and choose the automatic allocation action.
