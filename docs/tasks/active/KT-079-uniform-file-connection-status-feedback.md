# KT-079 - Uniform-file connection status feedback

- Status: `WORKER_COMPLETE`
- Task manager/worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `6ee980ae`

## Business outcome

The uniform-file connection check communicates a missing SHAAM connection as
an informational status rather than a successful operation.

## Acceptance criteria

- [x] Keep an active connection as a green success toast.
- [x] Present a missing connection with a neutral informational toast and a
      clear prompt to connect.
- [x] Preserve all connection, authorization and submission behavior.
- [x] Update the uniform-file topic documentation and pass the Angular build.

## Constraints

- No OAuth, backend, schema, external-call, production, deployment or push
  changes.

## Handoff

- Result: complete. A missing Daily Token is now informational rather than a
  false success; active connections remain green.
- Commit hash: pending local commit.
- Changed files: uniform-file page, its topic documentation and this task file.
- Verification: Angular production build passed. Existing style/bundle budget
  and CommonJS warnings remain unchanged; no focused unit test was available
  without the repository-wide legacy Karma compilation blockers documented in
  KT-077.
- External/schema/security impact: none. No SHAAM request was made.
