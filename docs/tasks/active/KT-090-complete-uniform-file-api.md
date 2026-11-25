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
- [x] Expose authenticated, owner-only external submission/polling APIs and
      business-scoped local status reads;
      never return Daily Tokens, signed URLs or upload-session URLs.
- [x] Add frontend connection, submission and status UX while retaining the ZIP
      download fallback and never displaying `Uploaded` as `Approved`.
- [x] Add focused client/orchestrator/controller/frontend tests for success,
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
- Branch integration added focused coverage for the observed tsandbox link
  order, empty reservation ID, fixture case number, mocked status, 406
  reauthorization, token clearing and owner-only enforcement. No external call
  was made during that verification.
- Dev schema was verified read-only. No DDL was run and production DB was not
  queried.
- Remaining gate: configure non-production variables locally, perform the
  interactive Daily Token authorization, confirm the comma-delimited scope
  assumption, and run controlled tsandbox acceptance with official/synthetic
  test data. Production remains fail-closed.

## Sandbox continuation — 2026-11-25

- Worktree: `C:/Users/harel/Elazar Harel/taxmyself/eharel-branch-0`, branch
  `eharel-branch-0`, base `7cdc8580` (fast-forwarded from current main).
- Elazar supplied current portal screenshots confirming both product
  subscriptions and `http://localhost:3000/shaam/oauth/callback`. The Upload
  Links and Files Status overview pages list the configured `ita-api` sandbox
  API hosts and `openapi` Daily Token authorize/token endpoints. The initial
  downloaded Swagger `host=t-ita-api` is not the only advertised gateway.
- Reviewed supplied `unistructfileuploadlinksapi_v1.json` and
  `FilesStatusApi-v1.json`. The latter lists all gateway alternatives and
  requires `FilesStatus_scope`. Neither confirms comma-separated request
  scopes or the sandbox upload artifact type; its status response has no
  schema. Do not infer final acceptance from the mock sandbox status.
- Local configuration presence was checked without exposing credentials:
  Uniform File is enabled in tsandbox, callback matches, and the separate
  production switch is off. No configuration was changed.
- Existing local verification: 6 backend suites / 46 tests passed; the
  dedicated frontend spec TypeScript program passed. This is not browser or
  external API acceptance evidence.
- Elazar generated the ledger-test fixture for business `222222226`, period
  `2026-02-01` through `2026-03-31`, then reported a callback response saying
  `Authorization code is required`. The provider error value and the stage
  of the interactive failure are still needed; do not assume invalid_scope.

### Callback diagnostic fix acceptance

- Handle a provider error or missing code for UNIFORM_FILE only, after the
  existing single-use state consumption and owner revalidation.
- Redirect to the existing frontend error screen with an allowlisted OAuth
  error and static message. Never forward provider descriptions, arbitrary
  query values, authorization codes, state or tokens.
- Do not exchange/save tokens on an unsuccessful callback. Preserve successful
  Daily Token and invoice-allocation callback behavior.
- No scope delimiter, credential, endpoint, schema, authorization policy or
  production changes. Live cause resolution remains pending provider evidence.
- Verification tier: backend controller; focused controller, Daily Token and
  OAuth-state suites plus Nest build. No frontend code or report-generation
  change; broader frontend/accounting suites are not required for this fix.
- Verification result: `npm test -- --runInBand --silent --runTestsByPath
  src/shaam/shaam-secure.controller.spec.ts
  src/shaam/uniform-file/uniform-file-oauth.service.spec.ts
  src/shaam/services/shaam-oauth-state.service.spec.ts` passed, 3 suites / 31
  tests, exit 0. `npm run build` passed, exit 0. `git diff --check` passed.
  Security-denial events in the test output are expected negative-test cases.
- Delivery: local callback diagnostic fix only. Runtime restart/retry and the
  actual authorization failure diagnosis remain pending; no external request,
  main integration, push or production action was performed in this fix.
