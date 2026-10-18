# KT-086 - Diagnose unknown SHAAM uniform-file status

- Status: `WORKER_COMPLETE`
- Task manager: Codex
- Worker: Codex
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `cc508584e14c0831783efe3c4313f070677e11d4`

## Business outcome

Expose enough safe evidence to identify an undocumented file-status value returned
by SHAAM tsandbox after a successful uniform-file upload, without exposing file
identifiers, tokens, signed URLs, or response bodies.

## Acceptance criteria

- [x] An unknown status emits one bounded diagnostic containing only the status
      token and structural metadata needed to classify it.
- [x] The request still fails closed until the newly observed status semantics are
      verified.
- [x] Tests prove that file identifiers and upstream error text are not logged.
- [x] SHAAM topic documentation describes the diagnostic boundary.

## Scope and constraints

- In scope: uniform-file status parsing diagnostics, focused tests, task-local and
  SHAAM topic documentation.
- Out of scope: accepting a guessed status, retrying uploads, production calls,
  schema changes, frontend changes.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`,
  `docs/coordination/QUALITY_GATES.md`, `backend/src/shaam/AGENTS.md`.
- Approval boundaries: no live external call or deployment by Codex.

## Handoff

- Result: complete
- Commit hash(es): this commit
- Changed files: upload client/service test, SHAAM topic documentation, task file.
- Tests and exact results: focused Jest: 24/24 passed; Nest build: passed.
- Known pre-existing failures: none observed.
- Schema / production / security / accounting / external impact: no schema,
  production or accounting change; security impact is a bounded allowlisted
  diagnostic that excludes identifiers and upstream content; external behavior
  remains fail-closed and makes no additional call.
- Risks and manual checks: restart the local backend and retry/poll the existing
  submission once; capture the `shaam_uniform_file_unknown_status` warning.
- Documentation updated: `backend/src/shaam/AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
