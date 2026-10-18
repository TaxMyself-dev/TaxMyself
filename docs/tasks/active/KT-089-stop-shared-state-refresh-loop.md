# KT-089 - Stop the shared-state refresh request loop

- Status: `WORKER_COMPLETE`
- Task manager: Codex
- Worker: Codex
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `eb2ebd86eb0c563535ffa30fecd97739eb02f417`

## Business outcome

Prevent the reconnect recovery effect from repeatedly calling
`GET /billing/me` and `GET /business/get-businesses` after shared Angular
signals change, while preserving one refresh for each genuine reconnect.

## Acceptance criteria

- [x] The reconnect effect tracks only `NetworkStatusService.reconnectedAt`.
- [x] One genuine reconnect triggers one shared-state refresh.
- [x] Signals read or changed inside the refresh do not retrigger it.
- [x] The frontend build passes; the regression spec is added and the existing
  suite-level Karma compilation blocker is documented.
- [x] The implementation documents why the untracked boundary is required.

## Scope and constraints

- In scope: AppComponent reconnect recovery, focused test and task documentation.
- Out of scope: changing normal billing polling, identity switching behavior,
  backend endpoints, schema, production calls and deployment.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`,
  `docs/coordination/QUALITY_GATES.md`.
- Approval boundaries: no deployment or live production operation by Codex.

## Handoff

- Result: complete
- Commit hash(es): this commit
- Changed files: AppComponent reconnect effect, focused regression spec and
  task documentation.
- Tests and exact results: production frontend build passed. The focused Karma
  command was blocked before execution because the current test target compiles
  all legacy specs and already fails on unrelated stale imports/Angular `async`
  usage and missing Node typings; the new regression spec produced no compile
  error in that output.
- Known pre-existing failures: the frontend Karma target has unrelated compile
  failures in legacy specs and third-party `exceljs`/`tesseract.js` typings.
- Schema / production / security / accounting / external impact: no schema,
  backend, accounting or external API contract change; reconnect recovery still
  performs the same two safe GET requests, once per actual reconnect.
- Risks and manual checks: after deploying the frontend, clear Network, reload,
  and verify `billing/me` plus `business/get-businesses` do not repeat while the
  tab remains online. Toggle offline/online once and verify one pair is sent.
- Documentation updated: inline reconnect invariant and this task record.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
