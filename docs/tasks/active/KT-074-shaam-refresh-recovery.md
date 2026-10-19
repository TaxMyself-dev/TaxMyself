# KT-074 - SHAAM refresh recovery and sandbox guard

- Status: `WORKER_COMPLETE`
- Task manager: Codex
- Worker: Codex
- Worktree: primary checkout (continuation of the user-approved SHAAM work on `main`)
- Branch: `main`
- Base commit: `ab92a338`

## Business outcome

An existing SHAAM connection is reused and refreshed without misleading the
user into granting authorization again after a transient failure. Sandbox
invoice-allocation attempts are limited to the dedicated Tax Authority test
issuer so a real development business cannot accidentally start OAuth.

## Acceptance criteria

- [x] A usable or successfully refreshed connection continues directly to the persisted allocation flow.
- [x] A transient refresh/network/server failure shows an error and never opens the authorization flow.
- [x] Only an absent connection or an explicit invalid/revoked grant is presented as requiring authorization.
- [x] A refresh response that omits `refresh_token` preserves the previously stored refresh token.
- [x] TSANDBOX invoice OAuth, connection status, allocation, and recovery reject businesses outside the configured sandbox allowlist.
- [x] Production behavior is not restricted by the TSANDBOX issuer guard.
- [x] Focused backend/frontend tests and both production builds pass.

## Scope and constraints

- In scope: SHAAM OAuth/connection orchestration, the document-create connection pre-flight, focused tests, and topic documentation.
- Out of scope: live SHAAM calls, production deployment/configuration, schema changes, allocation payload/accounting behavior, and the existing security alert at the Tax Authority.
- Required reading: root `AGENTS.md`, coordination workflow/authority/quality/lessons, backend SHAAM and frontend doc-create topic docs.
- Approval boundaries: do not call SHAAM while the security alert is unresolved; do not expose tokens or upstream error details to the browser.

## Handoff

- Result: complete; transient refresh failures no longer cause repeated OAuth and tsandbox allocation is restricted to approved test issuers.
- Commit hash(es): this task commit.
- Changed files: SHAAM constants/controller/OAuth/connection services and tests; doc-create pre-flight/service/tests; topic docs; this task record.
- Tests and exact results: backend focused Jest 17/17 passed; frontend focused ChromeHeadless 23/23 passed; Nest build passed; Angular production build passed.
- Known pre-existing failures: none. Angular build retained existing SCSS/initial-bundle and CommonJS warnings. The first sandboxed Chrome launch failed at the GPU/registry boundary; the identical test passed outside that boundary.
- Schema / production / security / accounting / external impact: no schema, document, numbering, journal or production-config change. Security is tightened in tsandbox; the OAuth refresh contract now distinguishes explicit grant revocation from transient errors.
- Risks and manual checks: no live SHAAM call was made because the Tax Authority security alert remains unresolved. Manual sandbox verification must wait for SHAAM support clearance.
- Documentation updated: backend SHAAM and frontend doc-create `AGENTS.md`, plus this task record.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
