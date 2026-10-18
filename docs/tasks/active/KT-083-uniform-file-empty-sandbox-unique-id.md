# KT-083 - Accept the documented empty sandbox reservation id

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `3a150310`

## Business outcome

Allow the observed Tax Authority sandbox reservation response to proceed while
keeping production reservation identifiers strict.

## Acceptance criteria

- [x] Accept an exactly empty reservation `uniqueId` only in tsandbox.
- [x] Keep non-empty bounded identifiers valid in both environments.
- [x] Reject an empty reservation `uniqueId` in production.
- [x] Cover both sandbox and production behavior with focused tests.
- [x] Update SHAAM topic documentation and pass focused tests plus the Nest build.

## Scope and constraints

- In scope: upload-link reservation identifier validation, tests and topic docs.
- Out of scope: other response-shape relaxations, schema, live calls, production
  activation, deployment and push.
- Required reading: root and `backend/src/shaam/AGENTS.md`.
- Approval boundaries: the user will explicitly retry the sandbox request.

## Handoff

- Result: complete
- Commit hash(es):
- Changed files: upload-link parser, focused tests, SHAAM topic docs and task file.
- Tests and exact results: focused Jest suite passed, 22 tests passed; Nest build passed.
- Known pre-existing failures: none encountered.
- Schema / production / security / accounting / external impact: no schema or
  accounting change; production remains strict and no live call was made by Codex.
- Risks and manual checks: restart the backend and retry submission 1 once in tsandbox.
- Documentation updated: `backend/src/shaam/AGENTS.md` and this task file.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
