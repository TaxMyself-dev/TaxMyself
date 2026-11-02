# KT-086 - SHAAM scope reauthorization

- Status: `COMPLETE_LOCAL`
- Task manager: Codex
- Worker: Codex
- Worktree: `C:/Users/harel/Elazar Harel/taxmyself/taxmyself-dev`
- Branch: `main`
- Base commit: `09beebab9181d23b47ef449a801fc6279c701120`

## Business outcome

When an existing SHAAM grant cannot be refreshed after the configured invoice
scope changes, settings clearly offers a full Tax Authority reauthorization.
Starting it requests a new authorization with the configured scope and keeps
the old stored grant until the callback successfully replaces it.

## Acceptance criteria

- [x] OAuth `invalid_scope` during refresh marks the connection as requiring reauthorization.
- [x] Connection status exposes the reauthorization requirement without exposing tokens or provider details.
- [x] Settings displays a clear "reconnect" status and button for that state.
- [x] Reconnect starts a fresh `/oauth/authorize` flow directly, without another status/refresh pre-flight.
- [x] A failed or abandoned authorization does not delete the previously stored grant.
- [ ] Focused backend/frontend tests and both builds pass. Backend focused tests and both builds pass; the frontend Karma suite is blocked before test execution by unrelated, pre-existing spec/type compilation failures.

## Scope and constraints

- In scope: SHAAM invoice OAuth refresh classification, safe connection-status metadata, settings reconnect UX and tests.
- Out of scope: deleting or revoking Tax Authority grants, changing invoice-allocation API behavior, production deployment.
- Required reading: `backend/src/shaam/AGENTS.md`, `frontend/src/app/pages/settings/AGENTS.md`, coordination workflow and quality gates.
- Approval boundaries: no schema, production, credential, or accounting changes.

## Handoff

- Result: Added an explicit SHAAM reauthorization state and reconnect action for grants that cannot be refreshed with the configured scope. A new OAuth flow is started without deleting the stored grant; a successful callback replaces it.
- Commit hash(es): pending local commit.
- Changed files: SHAAM OAuth/connection services and tests; settings SHAAM UI/service and tests; SHAAM/settings topic docs.
- Tests and exact results: backend SHAAM Jest — 3 suites, 19 tests passed; backend Nest build passed; frontend Angular production build passed.
- Known pre-existing failures: focused frontend Karma could not start because the repository test compilation includes unrelated existing errors (missing Node stream/Buffer types and stale symbols/imports in other specs). No KT-086 test executed in that run.
- Schema / production / security / accounting / external impact: no schema or accounting changes; no token/provider details exposed; no deployment and no external OAuth call performed.
- Risks and manual checks: manually verify in dev that the reconnect button reaches Tax Authority consent with `invoices_scope`, returns successfully, and changes status to connected. The Tax Authority provider controls whether its sandbox accepts that scope.
- Documentation updated: `backend/src/shaam/AGENTS.md`, `frontend/src/app/pages/settings/AGENTS.md`, and this task file.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
