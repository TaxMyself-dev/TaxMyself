# KT-087 - SHAAM callback origin and success status

- Status: `COMPLETE_LOCAL`
- Task manager: Codex
- Worker: Codex
- Worktree: `C:/Users/harel/Elazar Harel/taxmyself/taxmyself-dev`
- Branch: `main`
- Base commit: `685b58d97404bcbf67515ec7945aefcf916a0c4c`

## Business outcome

A successful Tax Authority connection returns the user to the flow that started
it. Settings-originated connections do not offer document issuance. Successful
invoice-allocation attempts retain the provider HTTP success status for safe
operational diagnostics.

## Acceptance criteria

- [x] Settings records a bounded SHAAM callback origin before leaving Keepintax.
- [x] A successful settings-originated callback offers only a return to the permissions settings tab.
- [x] Document-originated and legacy callbacks retain the document/home actions.
- [x] Callback origin is consumed once and cannot become an arbitrary redirect URL.
- [x] Successful allocation attempts persist the actual provider HTTP status.
- [x] Backend focused tests and both builds pass. Frontend Karma is blocked before test execution by documented pre-existing repository compilation failures.

## Scope and constraints

- In scope: frontend SHAAM initiation/callback context, allocation-attempt success metadata, tests and topic documentation.
- Out of scope: OAuth scopes, token storage, provider payloads, schema changes, deployment and production calls.
- No server processes will be started by Codex.

## Handoff

- Result: settings-originated SHAAM authorization now returns only to the permissions tab; document/legacy callbacks retain document actions. Successful Approval attempts persist the upstream HTTP status.
- Commit hash(es): pending local commit.
- Changed files: SHAAM frontend service/settings/callback and tests; backend invoice client/orchestrator and tests; topic docs and this task file.
- Tests and exact results: backend Jest 2 suites/15 tests passed; Nest build passed; Angular production build passed.
- Known pre-existing failures: focused frontend Karma reached bundle compilation but executed no tests because unrelated existing specs and missing Node typings fail the repository-wide test compilation.
- Schema / production / security / accounting / external impact: no schema/accounting/deployment/external call. Callback origin is an allowlisted session value, consumed once; no free-form redirect is accepted.
- Risks and manual checks: manually initiate from settings and verify the callback shows only `חזרה לניהול הרשאות`; initiate from document creation and verify the document action remains. A future successful allocation should store `provider_http_status=200`.
- Documentation updated: backend SHAAM, frontend settings, frontend SHAAM callback, and this task file.
