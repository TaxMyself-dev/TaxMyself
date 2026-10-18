# KT-088 - Mark rejected SHAAM connections for reauthorization

- Status: `WORKER_COMPLETE`
- Task manager: Codex
- Worker: Codex
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `2e34c1de83346cd9df4988999306ccc1d2d4773b`

## Business outcome

Stop presenting a SHAAM connection as active after SHAAM has definitively
rejected its server-held token, and require a fresh product-specific OAuth
authorization before the next protected operation.

## Acceptance criteria

- [x] A response explicitly classified by a SHAAM HTTP client as an
  authorization rejection marks only the matching
  business/product/environment connection as `REAUTH_REQUIRED`.
- [x] Rejected token material is cleared from the connection row.
- [x] The original upstream exception remains the response to the triggering
  request.
- [x] Invoice-allocation `406` responses do not invalidate the connection,
  because they may represent a business rejection rather than an auth failure.
- [x] Focused tests and the backend build pass.
- [x] SHAAM topic documentation describes the behavior.

## Scope and constraints

- In scope: connection-state service, authenticated SHAAM controller routes,
  focused tests, task-local and SHAAM topic documentation.
- Out of scope: live production calls, portal subscriptions/approval, frontend
  changes, schema changes and deployment.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`,
  `docs/coordination/AUTHORITY.md`, `docs/coordination/QUALITY_GATES.md`,
  `backend/src/shaam/AGENTS.md`.
- Approval boundaries: no live external call or deployment by Codex.

## Handoff

- Result: complete
- Commit hash(es): this commit
- Changed files: SHAAM connection service/controller and focused tests, SHAAM
  topic documentation, task file.
- Tests and exact results: focused Jest: 56/56 passed; Nest build: passed.
- Known pre-existing failures: none observed.
- Schema / production / security / accounting / external impact: no schema or
  accounting change; definitively rejected encrypted credentials are cleared;
  no live SHAAM request or production deployment was performed.
- Risks and manual checks: after deployment, reject/revoke a test token and
  confirm a protected request returns the original auth rejection, while the next
  connection-status check returns `connected: false` and the UI offers OAuth.
- Documentation updated: `backend/src/shaam/AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
