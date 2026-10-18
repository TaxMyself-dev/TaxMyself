# KT-084 - Map uniform-file links by the official response order

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `d9ca46f2`

## Business outcome

Correctly map the Tax Authority's two upload links to INI and BKM even when
their `fileName` values do not encode the file kind.

## Acceptance criteria

- [x] Treat the first documented response item as INI and the second as BKM.
- [x] Keep all URL, header, filename and per-file identifier validation.
- [x] Reject a pair whose two remote file identifiers are identical.
- [x] Cover arbitrary filenames and duplicate identifiers with focused tests.
- [x] Update SHAAM topic documentation and pass focused tests plus the Nest build.

## Scope and constraints

- In scope: upload-link pair mapping, tests and topic docs.
- Out of scope: schema, live calls, production activation, deployment and push.
- Required reading: root, `backend/src/shaam/AGENTS.md`, and the official
  uniform-file output table supplied by the Tax Authority.
- Approval boundaries: the user will explicitly retry the sandbox request.

## Handoff

- Result: complete
- Commit hash(es):
- Changed files: upload-link parser, focused tests, SHAAM topic docs and task file.
- Tests and exact results: focused Jest suite passed, 22 tests passed; Nest build passed.
- Known pre-existing failures: none encountered.
- Schema / production / security / accounting / external impact: no schema,
  production or accounting change; mapping now follows the official response
  order and no live request was made by Codex.
- Risks and manual checks: restart the backend and retry submission 1 once in tsandbox.
- Documentation updated: `backend/src/shaam/AGENTS.md` and this task file.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
