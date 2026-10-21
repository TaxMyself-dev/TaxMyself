# KT-090 - Complete the SHAAM Uniform File API

- Status: `IMPLEMENTED_LOCAL_AWAITING_TSANDBOX`
- Task manager: next Codex chat
- Worker: unassigned
- Worktree: `C:/Users/harel/Elazar Harel/taxmyself/taxmyself-dev`
- Branch: `main`
- Base commit: `c1b34918ce73b41e64f726460b57f4aeaafe255e` plus this documentation commit

## Business outcome

An authorized Keepintax user can generate the validated Uniform File pair,
obtain the Tax Authority Daily Token, submit both files safely, follow their
remote processing status and retain the ZIP download fallback without exposing
tokens or upload capabilities to the browser.

## Acceptance criteria

- [ ] Reconfirm the active portal/support contract for Daily Token authorize
      and token URLs, delimiter for the two scopes, callback, subscriptions and
      sandbox identities before enabling external calls.
- [x] Reserve upload links with the documented case/period/representative
      request and strictly validate the returned pair, file names, IDs, headers
      and size limits.
- [x] Initiate and complete server-side resumable uploads for the exact
      Windows-1255 INI/BKM buffers, including documented chunk tiers and HTTP
      201/308/200 handling.
- [x] Poll both file IDs and distinguish `Uploaded`, `Approved`, `Rejected` and
      not-found/permission outcomes; the pair is approved only when both files
      are approved.
- [x] Persist state before every external boundary and implement idempotent,
      restart-safe recovery. Never request a second link pair after an
      ambiguous outcome without reconciling saved file IDs.
- [x] Expose only authenticated, owner/delegate-scoped submission/status APIs;
      never return Daily Tokens, signed URLs or upload-session URLs.
- [x] Add frontend connection, submission and status UX while retaining the ZIP
      download fallback and never displaying `Uploaded` as `Approved`.
- [ ] Add focused client/orchestrator/controller/frontend tests for success,
      partial pair, rejection, authorization errors, timeouts, restart,
      concurrency and unknown outcomes.
- [ ] Run controlled tsandbox acceptance with synthetic/official test data and
      retain only redacted evidence.
- [ ] Keep production disabled until explicit activation approval, verified
      production configuration, a real inspector demand and an authorized
      canary business are available.

## Scope and constraints

- In scope: remaining Uniform File Daily Token, upload, polling, persistence,
  API, UI, tests and sandbox acceptance work.
- Out of scope without separate explicit approval: production deployment,
  production schema execution, real taxpayer submission, credential handling
  in chat/Git, and changes to invoice-allocation Long Time Token behavior.
- Required reading:
  - `AGENTS.md`
  - `docs/coordination/WORKFLOW.md`
  - `backend/src/shaam/AGENTS.md`
  - `backend/src/reports/AGENTS.md`
  - `frontend/src/app/pages/uniform-file/AGENTS.md`
  - `docs/tasks/active/KT-061-uniform-file-api-contract.md`
  - `docs/tasks/active/KT-062-uniform-file-oauth-boundary.md`
  - `docs/tasks/active/KT-063-shaam-unified-connections.md`
  - `docs/compliance/tax-authority/shaam-integration-lessons.md`
- Approval boundaries: do not call production, deploy, mutate production data
  or enable the production kill switch. Interactive authorization remains a
  user action.

## Current implementation boundary

- Generator/validator: `backend/src/reports/reports.service.ts` and
  `backend/src/reports/uniform-file-validator.ts` already produce the exact
  separate buffers needed by an uploader.
- OAuth: `backend/src/shaam/uniform-file/` implements the disabled-by-default
  Daily Token foundation. Active sandbox portal screenshots confirmed the exact
  `UniStructFileUploadLinks_scope` and `FilesStatus_scope` names, both product
  subscriptions and the shared callback. Per Elazar's support-call evidence and
  explicit direction, authorize and token exchange use one comma-delimited
  scope value; controlled tsandbox acceptance must confirm this assumption.
- Security/state: `ShaamSecureController`, `ShaamOauthStateService` and
  `ShaamConnectionService` provide authenticated product-aware infrastructure.
- API/orchestration: the disabled-by-default client reserves and validates one
  INI/BKM pair, uploads both buffers through trusted Google resumable sessions,
  polls both file IDs, and persists a restart-safe state machine before every
  external boundary. Authenticated business-scoped routes expose only safe
  pair-level metadata.
- Persistence: a read-only `information_schema` inspection confirmed all 30
  `uniform_file_submission` columns, indexes and the business FK in the dev
  database. Production was not inspected and must not be inferred from dev.
- Frontend: `/uniform-file` retains the existing ZIP download and adds Daily
  Token connection, explicit submit/poll controls and pair/file status. It
  never presents `Uploaded` as approved.

## Current verification / handoff

- Result: upload client, restart-safe orchestration, secure API and UI are
  implemented locally. The feature remains disabled by default; no external
  SHAAM request or production action was made.
- Backend focused Jest suites pass, and backend/frontend production builds
  pass. The two focused Angular specs compile, but the local ChromeHeadless
  process crashes in the Windows GPU/cache sandbox before Jasmine executes;
  manual UI verification remains required.
- Dev schema was verified read-only. No DDL was run and production DB was not
  queried.
- Remaining gate: configure non-production variables locally, perform the
  interactive Daily Token authorization, confirm the comma-delimited scope
  assumption, and run controlled tsandbox acceptance with official/synthetic
  test data. Production remains fail-closed.
