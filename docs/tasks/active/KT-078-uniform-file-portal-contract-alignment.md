# KT-078 - Uniform-file portal contract alignment

- Status: `WORKER_COMPLETE`
- Task manager/worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `85d048a9d8a886e883001c2d28421d0e2deb9083`

## Business outcome

Align the disabled-by-default uniform-file integration with the two OpenAPI
specifications downloaded from Keepintax's authenticated Tax Authority sandbox
portal after both products were subscribed to the existing allocation-number
application.

## Acceptance criteria

- [x] Use the exact portal scopes `UniStructFileUploadLinks_scope` and
      `FilesStatus_scope` in both authorization and token exchange.
- [x] Reuse the existing SHAAM application credentials and callback by default,
      while preserving optional uniform-file-specific overrides.
- [x] Provide verified tsandbox endpoint defaults without enabling the
      integration automatically or inferring production endpoints.
- [x] Remove the obsolete uniform-file state secret now that OAuth state is
      random, hashed, durable, single-use and stored in `shaam_oauth_state`.
- [x] Update focused tests and SHAAM topic documentation.
- [x] Run focused Jest suites, backend build and `git diff --check`.

## Scope and constraints

- In scope: uniform-file OAuth configuration, exact scopes, safe sandbox
  defaults, tests and topic/task documentation.
- Out of scope: live SHAAM calls, `.env` secret changes, production activation,
  production data, schema changes, deployment and push.
- The portal specifications are external contracts, not authorization to send
  taxpayer files or complete an interactive OAuth login.

## Handoff

- Result: complete. The existing sandbox application can now issue a separate
  Daily Token for both uniform-file products without duplicating credentials.
- Commit hash: pending local commit.
- Changed files: uniform-file OAuth configuration and focused specs, SHAAM
  topic documentation, this task file, plus two non-secret local `.env` flags
  that remain ignored and will not be committed.
- Tests: focused Jest passed 3 suites / 28 tests; Nest backend build passed;
  runtime configuration loaded successfully with secrets represented only as
  booleans; `git diff --check` passed.
- External/schema/production impact: no schema or production change and no live
  Tax Authority request. Production remains disabled and has no inferred URLs.
- Manual check: the next boundary is an explicitly initiated interactive
  sandbox authorization, followed by connectivity-only upload acceptance.
