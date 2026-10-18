# KT-081 - Uniform-file sandbox case number

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `9c23b7f3`

## Business outcome

Allow the Tax Authority uniform-file sandbox success fixture to be exercised
without replacing the real business identity used by Keepintax.

## Acceptance criteria

- [x] Support an explicit nine-digit sandbox-only case-number override.
- [x] Use the override only for the external upload-link reservation request.
- [x] Reject the override when the uniform-file environment is production.
- [x] Document the local environment variable and its sandbox-only meaning.
- [x] Cover configuration and request behavior with focused tests.
- [x] Pass the relevant backend tests and Nest build.

## Scope and constraints

- In scope: uniform-file configuration, upload-link request, tests and topic docs.
- Out of scope: schema, generated file contents, production activation, live calls and deployment.
- Required reading: root and `backend/src/shaam/AGENTS.md`.
- Approval boundaries: no external request, push or deployment.

## Handoff

- Result: complete
- Commit hash(es):
- Changed files: uniform-file config/upload client and tests, SHAAM topic docs,
  task file; local ignored `backend/.env` updated with the sandbox fixture and comment.
- Tests and exact results: 3 Jest suites passed, 34 tests passed; Nest build passed.
- Known pre-existing failures: none encountered.
- Schema / production / security / accounting / external impact: no schema or
  accounting change; override is rejected in production and no live call was made.
- Risks and manual checks: restart the backend, then retry submission 1 once in
  tsandbox and inspect the upload/status result.
- Documentation updated: `backend/src/shaam/AGENTS.md` and this task file.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
