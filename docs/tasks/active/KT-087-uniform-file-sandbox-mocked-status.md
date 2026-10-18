# KT-087 - Normalize SHAAM sandbox mocked file status

- Status: `WORKER_COMPLETE`
- Task manager: Codex
- Worker: Codex
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `8612d497343b13b87426eca8e7f6fbfd2ca0638d`

## Business outcome

Allow the uniform-file flow to recognize SHAAM tsandbox's observed
`Mocked Status` response as evidence that the uploaded file was found, without
misrepresenting the mock as production approval.

## Acceptance criteria

- [x] In tsandbox only, `Mocked Status` is normalized to `Uploaded`.
- [x] Production continues to reject `Mocked Status` as undocumented.
- [x] Existing documented SHAAM statuses are unchanged.
- [x] Focused tests and the backend build pass.
- [x] SHAAM topic documentation records the sandbox-only behavior.

## Scope and constraints

- In scope: uniform-file status normalization, focused tests, task-local and
  SHAAM topic documentation.
- Out of scope: treating the mocked response as approval, production calls,
  frontend changes, schema changes.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`,
  `docs/coordination/QUALITY_GATES.md`, `backend/src/shaam/AGENTS.md`.
- Approval boundaries: no live external call or deployment by Codex.

## Handoff

- Result: complete
- Commit hash(es): this commit
- Changed files: upload client/service test, SHAAM topic documentation, task file.
- Tests and exact results: focused Jest: 26/26 passed; Nest build: passed.
- Known pre-existing failures: none observed.
- Schema / production / security / accounting / external impact: no schema or
  accounting change; production remains fail-closed; tsandbox alone normalizes
  the observed mock value to the non-terminal `Uploaded` status; no additional
  external call is made.
- Risks and manual checks: restart the local backend and poll the existing
  submission; it should become `PROCESSING`/`UPLOADED`, not `APPROVED`.
- Documentation updated: `backend/src/shaam/AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
