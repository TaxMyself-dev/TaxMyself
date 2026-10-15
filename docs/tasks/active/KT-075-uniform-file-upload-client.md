# KT-075 - Uniform-file upload client

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `a81cf3ebeabd25ce4bfd7f8183dcac9ce5f39af5`

## Business outcome

Keepintax has a fail-closed backend client capable of reserving SHAAM upload
links, transmitting both uniform-file artifacts through resumable uploads and
checking both remote statuses, while remaining disabled and fully mocked in
this task.

## Acceptance criteria

- [x] Add explicit upload-links and file-status endpoint configuration with the
      existing uniform-file kill switches and Tax Authority host validation.
- [x] Validate the upload-links response, classify INI/BKM by name rather than
      trusting array order, and reject malformed or oversized artifacts.
- [x] Initiate resumable uploads, send size-tiered chunks, accept intermediate
      HTTP 308 only, and require 200/201 completion for both files.
- [x] Query and validate both remote file statuses without treating `Uploaded`
      as approval.
- [x] Normalize errors without exposing bearer tokens, signed URLs, upload
      session locations or upstream bodies.
- [x] Cover success, 308, partial pair, malformed response, size rejection,
      authentication/business errors, timeout and disabled-mode zero-call
      behavior with mocks; pass the backend build.

## Scope and constraints

- In scope: disabled-by-default low-level HTTP client, configuration, DTO-like
  internal types, mock contract tests, SHAAM topic documentation and this task.
- Out of scope: controller/orchestration wiring, submission-state mutations,
  frontend, schema/cutover changes, live SHAAM calls, production data,
  deployment, push.
- Required reading: root/coordination instructions, SHAAM topic docs and the
  KT-061 API contract.
- Approval boundaries: use only the already documented official contract; stop
  on any missing endpoint/response decision rather than guessing.

## Handoff

- Result: complete
- Commit hash(es): pending local commit
- Changed files: uniform-file OAuth configuration/tests, low-level upload
  service/tests, SHAAM module/topic documentation and this task file.
- Tests and exact results: focused Jest command passed 3 suites / 27 tests;
  backend Nest build passed; `git diff --check` passed with line-ending warnings
  only.
- Known pre-existing failures: none observed in the required focused gates.
- Schema / production / security / accounting / external impact: no schema,
  production or accounting change; zero live external requests.
- Risks and manual checks: client remains deliberately unexposed and all calls
  were mocked. Portal endpoint/subscription verification and controlled sandbox
  acceptance remain required before any live use.
- Documentation updated: `backend/src/shaam/AGENTS.md` and this task file.

## Integration

- Reviewed by: pending
- Integrated commit: pending
- Combined verification: pending
- `origin/main` verification: not applicable
- User-visible run instructions: none; client remains unexposed.
