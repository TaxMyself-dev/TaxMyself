# KT-127 - Admin demo subscription visibility

- Status: `PUSHED`
- Task manager: Codex primary manager
- Worker: Codex primary manager
- Worktree: `C:/Users/harel/Elazar Harel/taxmyself/taxmyself-dev`
- Branch: `main`
- Base commit: `7deef50782c77cb8cb3df19793c5b704c5db82d9`

## Business outcome

Billing administrators can explicitly reveal demo subscriptions while the
default list stays limited to current non-demo users. Demo rows are labelled,
ordinary demos cannot expose manual charge actions, and orphaned subscription
history no longer renders as nameless user rows.

## Acceptance criteria

- [x] Demo subscriptions are hidden by default and loaded only when the admin
  selects "הצג משתמשי דמו".
- [x] Visible demo rows are labelled and manual charge actions remain available
  only for the dedicated billing-QA profile.
- [x] Subscription rows without a current `User` are excluded from the
  user-facing table without deleting billing history.
- [x] Focused backend/frontend tests and both production builds pass.

## Scope and constraints

- In scope: admin billing list API, subscription table controls/presentation,
  demo/manual-charge visibility, focused tests and topic documentation.
- Out of scope: deleting orphaned production billing history; repairing the
  generic-table floating action borders; redesigning demo reset cleanup.
- Required reading: root instructions, billing/admin-billing topic docs,
  coordination workflow and quality gates.
- Approval boundaries: Elazar explicitly requested commit and push. No
  deployment or production database mutation is included.

## Handoff

- Result: complete
- Commit hash(es): `3efbc98f2c260dac7bfa1d535bf8e228a866d4a2`
- Changed files: backend admin billing controller/service/tests/docs; frontend
  admin billing service/component/tests/docs; this task record.
- Tests and exact results: backend focused Jest 2 suites / 21 tests passed;
  final service rerun 14/14 passed after the orphan fixture correction;
  isolated ChromeHeadless frontend 15/15 passed; Nest build passed; Angular
  production build passed; `git diff --check` passed.
- Known pre-existing failures: an initial non-isolated Angular invocation loaded
  unrelated legacy specs and failed compilation; the existing isolated billing
  tsconfig compiled successfully. Sandboxed ChromeHeadless could not initialize
  GPU; the same isolated command passed outside the sandbox. Production build
  retained existing style/bundle budget and CommonJS warnings.
- Schema / production / security / accounting / external impact: no schema,
  production data, accounting or external-provider changes. Admin authorization
  remains server-side. The new query defaults to excluding demos.
- Risks and manual checks: orphaned billing rows remain stored and require a
  separate safe cleanup design. Confirm the unchecked/checked list behavior and
  complimentary-access edit after deployment.
- Documentation updated: `backend/src/billing/AGENTS.md` and
  `frontend/src/app/shared/admin-billing/AGENTS.md`.

## Required main local port verification

- Verified 2026-11-24 before commit/push.
- Frontend main start path: `npm start` -> `frontend/scripts/start-local.js`;
  with no ignored worktree override it serves `4200`.
- Backend local setting: `backend/.env` has `PORT=3000`; `start:watch` preserves
  the process/environment value unless an ignored worktree ports file exists.
- Frontend development API URL: `http://localhost:3000/` in
  `frontend/src/environments/environment.ts`.
- Process overrides checked: no `PORT`, `FRONTEND_PORT`, `BACKEND_PORT`,
  `API_URL` or `NG_APP_API_URL` override was present.
- Production configuration remains unchanged: its deployed API URL is retained
  in `environment.prod.ts`.
- Effective main local configuration: frontend `4200`, backend `3000`, API URL
  `http://localhost:3000/`.

## Integration

- Reviewed by: Codex primary manager
- Integrated commit: `3efbc98f2c260dac7bfa1d535bf8e228a866d4a2`
- Combined verification: focused backend/frontend tests plus both builds passed
  on the final source.
- `origin/main` verification: local `main` and `origin/main` both resolved to
  `3efbc98f2c260dac7bfa1d535bf8e228a866d4a2` after push.
- User-visible run instructions: Admin Panel -> CardCom / subscriptions; toggle
  "הצג משתמשי דמו" to reveal demo accounts, then edit the intended user.
