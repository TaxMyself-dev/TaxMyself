# KT-077 - Uniform-file user flow

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `37ae242f`

## Business outcome

The existing uniform-file page keeps ZIP download and adds an explicit,
authenticated flow to prepare, connect, transfer and poll a SHAAM submission
without exposing tokens or capability URLs.

## Acceptance criteria

- [x] Keep the current ZIP generation/download behavior available.
- [x] Add typed frontend calls for prepare, connection status, OAuth initiation,
      transfer and poll using only the existing Firebase-authenticated backend.
- [x] Present clear Hebrew actions and states; never label Uploaded/PROCESSING
      as approval and require an explicit click before transfer.
- [x] Disable duplicate actions while a request is running and surface safe
      backend errors through the existing toast.
- [x] Preserve the selected business/period through the page flow and scope all
      calls to that business.
- [x] Update topic documentation and pass the Angular build; the focused Karma
      command is compilation-blocked by unrelated legacy specs/type declarations.

## Constraints

- No live SHAAM calls, production data, schema changes, deployment or push.
- OAuth remains an interactive browser redirect; no token enters frontend code.
- No automatic polling loop in this task; polling is an explicit user action.

## Handoff

- Result: complete
- Commit hash(es): pending local commit
- Changed files: uniform-file page TS/template/styles/topic docs, typed SHAAM
  service and spec, product-aware OAuth callback/docs, and this task.
- Tests and exact results: Angular production build passed. The focused
  `shaam.service.spec.ts` Karma command did not execute tests because Angular's
  runner compiled unrelated legacy specs and failed on their existing imports,
  missing Node types and ExcelJS/Tesseract declarations.
- Risks / manual checks: authenticated visual verification is required for
  responsive layout, OAuth return navigation and the disabled/processing/error
  button states. No live external request was made.
- Documentation updated: uniform-file and SHAAM-callback topic AGENTS files.
