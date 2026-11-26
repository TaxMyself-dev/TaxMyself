# KT-090 - Complete the SHAAM Uniform File API

- Status: `SANDBOX_ACCEPTED_BY_ELAZAR_PRODUCTION_BLOCKED`
- Task manager: Codex primary chat
- Worker: unassigned
- Worktree: `C:/Users/harel/Elazar Harel/taxmyself/eharel-branch-0`
- Branch: `eharel-branch-0`
- Continuation base commit: `7cdc8580` (2026-11-25)

## Business outcome

An authorized Keepintax user can generate the validated Uniform File pair,
obtain the Tax Authority Daily Token, submit both files safely, follow their
remote processing status and retain the ZIP download fallback without exposing
tokens or upload capabilities to the browser.

## Acceptance criteria

- [x] Reconfirm the active portal/support contract for Daily Token authorize
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
- [x] Run controlled tsandbox acceptance with synthetic/official test data and
      retain only redacted evidence. Accepted by Elazar as described below;
      `Mocked Status` is sufficient for sandbox acceptance, not production approval.
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
  explicit direction, authorize and token exchange initially used one
  comma-delimited scope value. Following the observed `invalid_scope`, Elazar
  approved a tsandbox-only space-delimited trial on 2026-11-25 (see below).
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

- Main delivery approved by Elazar on 2026-11-26. Integration candidate:
  `codex/integration-kt090`, containing the five local follow-up commits through
  `7367ca22`, based on freshly fetched `origin/main` `7cdc8580`. This approval
  is for source integration/push, not deployment or production activation.
- Combined integration verification on the exact candidate application tree:
  backend `npm test -- --runInBand --silent --runTestsByPath
  src/shaam/shaam-secure.controller.spec.ts
  src/shaam/services/shaam-oauth-state.service.spec.ts
  src/shaam/uniform-file/uniform-file-oauth.service.spec.ts
  src/shaam/uniform-file/uniform-file-oauth.config.spec.ts
  src/shaam/uniform-file/uniform-file-api.config.spec.ts
  src/shaam/services/shaam-oauth.service.spec.ts` passed, 6 suites / 55 tests,
  exit 0; `npm run build` passed, exit 0. Expected negative-test denial logs
  appeared. Frontend `npm test -- --watch=false --browsers=ChromeHeadless
  --ts-config=tsconfig.uniform-file.spec.json
  --include=src/app/pages/uniform-file/uniform-file.page.spec.ts` passed,
  12 tests executed in ChromeHeadless, exit 0.
- Frontend `npm run build -- --configuration=production` passed, exit 0.
  Existing settings unused-import, SCSS/initial bundle budget and CommonJS
  warnings remain. Full candidate diff and `git show --check` were reviewed;
  no schema, environment file, credential, build artifact or dependency change
  is included. No broader accounting tests were required for this scope.
- Operator-supplied production metadata screenshots confirmed the three tables,
  their expected columns/indexes and business foreign-key targets. The final
  exact comparison of the full `uniform_file_submission.state` enum returned
  `OK`. No schema change was identified from the supplied evidence. This was
  operator-run read-only verification, not direct production access by Codex;
  it does not verify runtime permissions, data or all FK update/delete actions.
- Required pre-integration main port check passed: frontend startup defaults
  4200, backend ignored local `.env` has `PORT=3000`, frontend development API is
  `http://localhost:3000/`; no `.local-ai-dev/ports.json` or relevant process port
  override was present. Main's tracked and untracked working tree was clean.
  The integration worktree's pre-existing untracked `output/` is preserved and
  excluded from delivery. No production environment settings were inspected.
- Production preparation continuation (2026-11-26): Elazar supplied both
  production OpenAPI files, reported registering both products on the production
  application, and supplied its registered HTTPS callback. Authorized scope:
  align Daily Token request serialization with the successful space-delimited
  sandbox flow; verify the supplied production endpoints and shared-credential
  fallback in local tests. No deployment, production access, schema changes or
  flag activation. Production OAuth success remains unverified.
- Acceptance for this continuation: authorization and token exchange send the
  same two space-delimited Daily Token scopes in both environments; invoice
  `SHAAM_SCOPES` is neither modified nor included. Exact supplied `openapi`
  production URLs load with the explicit activation switch, and missing URLs,
  sandbox API endpoints/fixture overrides and a disabled production switch remain
  blocked. Both switches remain false in the preparation instructions.
- Verification tier: backend service/config; focused Daily Token service and
  configuration suites, invoice OAuth regression suite and Nest build. No
  frontend, accounting or schema behavior changes.
- Sandbox stage accepted by Elazar on 2026-11-25. Daily Token with
  space-delimited scopes succeeded; the user-driven submission screen showed
  both files uploaded and the pair processing. Elazar confirmed that a
  `Mocked Status` response satisfies SHAAM sandbox acceptance and closed this
  stage. Raw upstream status was not independently captured in this chat;
  the UI normalizes both `Uploaded` and `Mocked Status` to `UPLOADED`.
- Support confirmation relayed by Elazar: send the normal INI/BKM file pair,
  not PDFs. This supersedes the older PDF-only sandbox instruction for this test.
- Production remains blocked. Remaining work: dev/staging MFA acceptance,
  monitoring/security audit, verified production contract/configuration/schema,
  activation approval and an authorized inspector-demand canary. Sandbox
  acceptance does not authorize any production action.
- Local follow-up commits: `d7edda60` (safe callback errors), `ef4b603a`
  (sandbox space delimiter), `afe49ef1` (restore selection after OAuth).

### Earlier implementation handoff (before the November sandbox run)

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
  interactive Daily Token authorization, confirm the scope delimiter through
  the approved sandbox trial, and run acceptance with official/synthetic
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

### Approved Daily Token scope delimiter trial — 2026-11-25

- Elazar's subsequent screenshot confirms a provider `invalid_scope` callback.
  This identifies the OAuth failure category, not its root cause.
- Elazar explicitly approved trying a space between the same two Daily Token
  scopes in tsandbox. Exact decoded request value:
  `UniStructFileUploadLinks_scope FilesStatus_scope`.
- Acceptance: authorization and code exchange send that identical value in
  tsandbox; production serialization retains its existing comma, production
  activation stays blocked, and invoice Long Time Token behavior is unchanged.
- This scoped experiment supersedes the older comma requirement for tsandbox
  in KT-061 and the integration lessons. It is not a verified provider contract
  until interactive authorization and token exchange succeed.
- Validation tier: backend service. Run focused Daily Token service/config
  tests covering both environments, both request stages, returned-scope
  validation and disabled mode; run Nest build. No frontend code changed.
- No credentials, callback registration, database records or external product
  subscriptions are changed. The user must initiate a fresh connection; never
  replay the consumed callback URL or alter its state.
- Focused validation: `npm test -- --runInBand --silent --runTestsByPath
  src/shaam/uniform-file/uniform-file-oauth.service.spec.ts
  src/shaam/uniform-file/uniform-file-oauth.config.spec.ts` passed, 2 suites /
  14 tests, exit 0. Initial parallel Nest build failed with Node native
  `Fatal process out of memory: Zone`; sequential `npm run build` retry after
  Jest exited passed with exit 0. `git diff --check` passed. Live authorization
  with the space delimiter remains pending; no external request was automated.

### User-confirmed OAuth success and return selection — 2026-11-25

- Elazar confirmed the space-delimited trial worked and supplied the local
  Uniform File screen showing `מחובר לרשות המסים` for the ledger-test business.
  This is interactive Daily Token connection evidence; upload-links, upload,
  status and production acceptance remain unverified.
- Follow-up defect: returning from OAuth reset business/date filters. Approved
  scope: retain the generated report's business and date range across this
  navigation, so the user does not have to select them again.
- Implementation acceptance: save only user-bound business/start/end values
  in tab-scoped session storage before OAuth; consume once on return and
  validate the current user, accessible business and date range. Restore
  filter defaults and regenerate the local report without downloading another
  ZIP or automatically submitting files. Explicit generation still downloads.
- Failed restoration retains the filters and surfaces the generation error;
  no successful-report card or submit action is shown until generation succeeds.
  Failed OAuth initiation clears the saved return selection.
- Verification tier: frontend component behavior, focused Uniform File page
  tests plus Angular production build. No database/schema/accounting or
  backend behavior changes, and no external submission.
- `npm test -- --watch=false --browsers=ChromeHeadless
  --ts-config=tsconfig.uniform-file.spec.json
  --include=src/app/pages/uniform-file/uniform-file.page.spec.ts` passed:
  12 tests executed in ChromeHeadless, exit 0. The dedicated tsconfig avoids
  the historical broad-spec compilation blocker; this run is execution
  evidence rather than only TypeScript validation.
- `npm run build -- --configuration=production` passed, exit 0. Warnings:
  unrelated settings unused import, SCSS/initial bundle budgets and CommonJS
  dependencies. `git diff --check` passed. Local fix only; no main integration,
  push, production deployment or external file submission was performed.

### Production contract and local preparation — 2026-11-26

- Base for this continuation: `f498428e` on `eharel-branch-0`.
- Evidence supplied by Elazar: `UniStructFileUploadLinksApi-v1_prod.json`,
  `FilesStatusApi-v1_prod.json`, production portal screenshots, product
  registration confirmation and the callback below. The upload specification
  advertises `openapi` only; the status specification explicitly includes
  `openapi` among its gateways. Both advertise production Daily Token OAuth.
- Request paths and payloads are supported by the existing client. The status
  specification still has no response schema; real production response parsing
  remains a canary verification item. No production response was captured.
- Approved local change: send the two fixed Daily Token scopes with a space in
  both environments, for authorization and code exchange. This supersedes the
  earlier temporary production-comma boundary. It follows successful sandbox
  authorization and OAuth scope syntax, not a claim of production acceptance.
  Existing invoice `SHAAM_SCOPES` and Long Time Token serialization are unchanged.
- Elazar is preparing the following backend variables. These are desired
  configuration values, not evidence of deployment or effective live settings:

```dotenv
SHAAM_UNIFORM_FILE_ENV=production
SHAAM_UNIFORM_FILE_REDIRECT_URI=https://taxmys16elf-prod-146140406969.me-west1.run.app/shaam/oauth/callback
SHAAM_UNIFORM_FILE_AUTHORIZE_URL=https://openapi.taxes.gov.il/shaam/production/dailytoken/oauth2/authorize
SHAAM_UNIFORM_FILE_TOKEN_URL=https://openapi.taxes.gov.il/shaam/production/dailytoken/oauth2/token
SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL=https://openapi.taxes.gov.il/shaam/production/UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles
SHAAM_UNIFORM_FILE_STATUS_URL=https://openapi.taxes.gov.il/shaam/production/FilesStatusApi/v1/Files/get-file-status
SHAAM_UNIFORM_FILE_ENABLED=false
SHAAM_UNIFORM_FILE_PRODUCTION_ENABLED=false
```

- If both products use the existing production application, the loader can reuse
  `SHAAM_CLIENT_ID` and `SHAAM_CLIENT_SECRET`. Different applications require
  `SHAAM_UNIFORM_FILE_CLIENT_ID` / `SHAAM_UNIFORM_FILE_CLIENT_SECRET` overrides.
  Never put credentials in documentation, Git or chat. Remove any
  `SHAAM_UNIFORM_FILE_SANDBOX_CASE_NUMBER` from production. Preserve the existing
  `SHAAM_TOKEN_ENC_KEY_B64`; verify the production `FRONTEND_URL` independently.
- Both flags stay false until the remaining security, schema, activation and
  canary gates are complete. Enabling only the general flag with environment
  `production` fails startup deliberately. A fresh owner-initiated production
  Daily Token connection will be required; sandbox grants are not reused.
- Focused verification: `npm test -- --runInBand --silent --runTestsByPath
  src/shaam/uniform-file/uniform-file-oauth.service.spec.ts
  src/shaam/uniform-file/uniform-file-oauth.config.spec.ts
  src/shaam/uniform-file/uniform-file-api.config.spec.ts
  src/shaam/services/shaam-oauth.service.spec.ts` passed: 4 suites / 31 tests,
  exit 0. Expected invoice OAuth negative-test logs appeared. Initial sandboxed
  invocation could not resolve npm; the same focused command ran successfully
  with the approved local tooling access. All HTTP calls in these tests are
  mocked; no provider or database access occurred.
- `npm run build` passed (Nest, exit 0). `git diff --cached --check` passed.
  No frontend build or accounting suites were required for this isolated backend
  OAuth serialization change. Local delivery only: no integration, push,
  production deployment, credential change or switch activation.
