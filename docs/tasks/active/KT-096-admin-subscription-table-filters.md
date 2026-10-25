# KT-096 - Admin subscription table filters

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary integration manager
- Worker: Codex (direct, non-parallel task)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `ee10b7b1c38c2a087c8233c7f6d82ff8b6dbf780`

## Business outcome

The admin CardCom/subscriptions table contains real users only and can be
filtered by the three relevant onboarding/billing statuses.

## Acceptance criteria

- [x] Registered demo-profile users do not appear in the admin subscriptions list.
- [x] The subscriptions table offers All, Active, Trial, and Trial expired filters.
- [x] The default filter shows all non-demo subscriptions.
- [x] Search, row actions, and status presentation continue to work on filtered rows.
- [x] Focused backend and frontend tests plus both builds pass.

## Scope and constraints

- In scope: admin billing subscription list response and subscription-table UI.
- Out of scope: subscription lifecycle changes, CardCom calls, schema/data changes,
  other admin tables, and production access.
- Required reading: root instructions, `docs/coordination/WORKFLOW.md`,
  `docs/coordination/AUTHORITY.md`, `docs/coordination/QUALITY_GATES.md`,
  `backend/src/billing/AGENTS.md`, and
  `frontend/src/app/shared/admin-billing/AGENTS.md`.
- Approval boundaries: no schema, production, authorization, accounting, or
  external-contract changes.

## Handoff

- Result: complete
- Commit hash(es): pending local commit
- Changed files: admin billing backend service/spec/topic docs; subscription
  table component/template/styles/spec/topic docs; this task file.
- Tests and exact results:
  - Backend focused Jest: 1 suite, 14 tests passed.
  - Frontend focused Karma: 7 tests passed in Chrome Headless 155.
  - Nest build: passed (exit 0).
  - Angular production build: passed (exit 0).
- Known pre-existing failures: the first Karma launch failed before executing
  tests because the default ChromeHeadless GPU process crashed; rerunning with
  no-sandbox/disable-gpu flags passed all 7 tests. Angular retained existing
  style/initial-bundle budget and CommonJS warnings.
- Schema / production / security / accounting / external impact: none. The
  existing admin-only API contract returns fewer rows; no CardCom call or
  subscription mutation changed.
- Risks and manual checks: verify the filter layout visually at desktop and
  mobile widths in the admin panel.
- Documentation updated: backend and frontend admin-billing topic `AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
