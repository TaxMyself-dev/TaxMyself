# KT-082 - Uniform-file reservation diagnostics

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `efba4742`

## Business outcome

Make a sandbox upload-link contract mismatch diagnosable without exposing
tokens, signed URLs, identifiers or upstream response values.

## Acceptance criteria

- [x] Log only a bounded structural summary when the reservation envelope is invalid.
- [x] Do not log tokens, field values, signed URLs, file identifiers or response bodies.
- [x] Cover the diagnostic shape and sensitive-value exclusion with a focused test.
- [x] Update SHAAM topic documentation and pass focused tests plus the Nest build.

## Scope and constraints

- In scope: upload-link response validation diagnostics, test and topic docs.
- Out of scope: accepting an undocumented response shape, live calls, schema,
  production activation, deployment and push.
- Required reading: root and `backend/src/shaam/AGENTS.md`.
- Approval boundaries: the user will explicitly retry the sandbox request.

## Handoff

- Result: complete
- Commit hash(es):
- Changed files: upload client, focused test, SHAAM topic docs and task file.
- Tests and exact results: focused Jest suite passed, 20 tests passed; Nest build passed.
- Known pre-existing failures: none encountered.
- Schema / production / security / accounting / external impact: no schema,
  production or accounting change; diagnostic excludes all upstream values and
  no live request was made by Codex.
- Risks and manual checks: restart the backend and retry submission 1 once; use
  the structural warning to align the parser with observed sandbox behavior.
- Documentation updated: `backend/src/shaam/AGENTS.md` and this task file.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
