# KT-076 - Uniform-file transfer orchestration

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `1bc51a94`

## Business outcome

An authenticated business can explicitly transmit a prepared uniform-file
submission with its server-held Daily Token and safely poll the two persisted
SHAAM file identifiers, without exposing file bytes or external capabilities.

## Acceptance criteria

- [x] Regenerate the prepared pair from its persisted timestamp and fail closed
      unless hashes and byte lengths still match the stored artifact.
- [x] Reserve links once, persist only safe pair/file identifiers before upload,
      upload INI then BKM, and persist each state transition.
- [x] Poll both persisted file identifiers and derive PROCESSING, APPROVED or
      REJECTED only from validated per-file results.
- [x] Treat ambiguous network/storage outcomes as UNKNOWN_OUTCOME and never
      reserve a replacement pair automatically when identifiers already exist.
- [x] Add authenticated, business-scoped submit and poll endpoints that use only
      the server-held uniform-file Daily Token.
- [x] Cover business scoping, missing auth, artifact mismatch, partial upload,
      safe failure persistence, polling and terminal states with mocks; pass the
      backend build.

## Scope and constraints

- In scope: backend orchestration, safe views, controller endpoints, focused
  tests, SHAAM topic documentation and this task.
- Out of scope: schema/cutover changes, automatic retry/new reservation policy,
  frontend, live SHAAM calls, production data, deployment or push.
- Existing enum/schema values only; no database migration is authorized.
- An existing remote identifier always causes polling, never a blind reserve.

## Handoff

- Result: complete
- Commit hash(es): pending local commit
- Changed files: submission orchestration/service tests, secure controller/tests,
  upload-response identifier bound, SHAAM topic documentation and this task.
- Tests and exact results: focused Jest tests passed in two processes: 14/14
  orchestration tests and 26/26 controller/upload-client tests (40 total);
  backend Nest build passed.
- Known pre-existing failures: the first combined Jest process completed no
  suites before hanging and was interrupted; split runs passed but required
  `--forceExit`, with Jest's existing open-handle warning.
- Schema / production / security / accounting / external impact: no schema,
  production or accounting change; guarded server-only SHAAM boundary; zero
  live external requests.
- Risks and manual checks: no live call occurred. A process interruption after
  the atomic reservation claim but before safe identifiers are stored fails
  closed as UNKNOWN_OUTCOME; resolving that rare state requires a future
  explicit recovery decision rather than an automatic replacement reservation.
- Documentation updated: `backend/src/shaam/AGENTS.md` and this task file.
