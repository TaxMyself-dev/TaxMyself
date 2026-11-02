# KT-088 - SHAAM refresh observability

- Status: `COMPLETE_LOCAL`
- Task manager: Codex
- Worker: Codex
- Worktree: `C:/Users/harel/Elazar Harel/taxmyself/taxmyself-dev`
- Branch: `main`
- Base commit: `afbd0276b13de9a43ab5a790bc8291b10a4c4223`

## Business outcome

An operator can distinguish a SHAAM access-token refresh starting, succeeding,
requiring a new authorization, or failing transiently without inspecting token
contents or database rows.

## Acceptance criteria

- [x] Refresh start and success are visible at a Nest log level enabled by the application.
- [x] Missing/rejected grants emit a bounded reauthorization-required warning.
- [x] Transient/configuration failures state that the active connection status was preserved.
- [x] Refresh logs contain no access token, refresh token, actor/business identifier or raw provider message.
- [x] Focused SHAAM tests and the backend build pass.

## Scope and constraints

- In scope: server-side SHAAM connection refresh observability, tests and topic documentation.
- Out of scope: OAuth behavior, token persistence rules, schema changes, deployment and production calls.
- The global Nest logger configuration remains unchanged to avoid enabling unrelated application logs.
- No server processes were started by Codex.

## Handoff

- Result: structured refresh lifecycle events use enabled `debug`, `warn` and `error` levels with a safe metadata allowlist.
- Commit hash: pending local commit.
- Changed files: SHAAM connection service/spec, SHAAM topic documentation and this task file.
- Tests: Jest 2 suites/12 tests passed; Nest build passed.
- Schema / production / security / accounting / external impact: no schema, accounting, deployment or external API call. Logging explicitly excludes tokens and business/actor identifiers.
- Manual check: force only the dev connection expiry, load connection status without reconnecting, and verify `started` followed by `success` while the UI remains connected.
