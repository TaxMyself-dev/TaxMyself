# Outlook email through Composio

Status: DEV_CONFIGURED_AWAITING_MICROSOFT_CONSENT
Base: 7b63265d; main and origin/main verified equal on 2026-11-23.

Acceptance: owner can connect/reconnect/disconnect Outlook in Settings; Microsoft identity is verified and stored separately from Google; existing manual/initial/nightly durable intake reads Outlook files with fixed date ranges and pagination; Gmail remains compatible.

Plan: provider-aware OAuth/client boundary and Outlook adapter; shared intake and settings; focused backend/frontend regressions and builds; configuration documentation; local commit.

Boundaries: schema preparation approved on 2026-11-23; no live schema changes, live mailbox reads, database access, main integration, push or deployment. No accounting/deletion policy changes. Existing GMAIL source names remain internal shared email pipeline identifiers. Provider schemas discovered through Composio only; live OAuth/toolkit configuration remains an operator check.

## Implementation checkpoint

Added owner-only Outlook OAuth/callback, verified Microsoft profile identity, provider-specific managed auth config/tool versions/read-tool allowlists, local/remote disconnect handling, a Microsoft attachment adapter and persisted-provider routing. Settings includes Outlook add/reconnect/disconnect; shared initial/manual/nightly intake accepts Microsoft. Google endpoints remain compatible. Updated topic docs and docs/features/outlook-email.md. No accounting/deletion policy changes.

## Historical decision request (superseded below)

The existing durable queue uses VARCHAR(128) for message_id and default case-insensitive collation. Microsoft opaque IDs can be longer and case-sensitive. Asked Elazar to approve preparation of a VARCHAR(512) ASCII binary field change without applying it, or choose connect-only scope. No reply yet. No schema/SQL edits performed; do not integrate or enable live Outlook intake on this checkpoint.

## Exact verification evidence

Risk tier: backend service/controller plus frontend service/component behavior. Node 24.13.0, npm 11.6.2. No app boot or live DB/mailbox operation was requested or performed by development commands.

All commands below ran in the respective backend/frontend directory of this feature worktree.

- Backend `npm ci --no-audit --no-fund --prefer-offline`: 1176 packages installed, exit 0. Initial sandbox attempt was denied; an escalated concurrent install failed ENOSPC. Sequential installation succeeded. Backend node_modules was later removed only in this new worktree after backend verification to make room for frontend dependencies.
- Backend `npm test -- --runInBand --silent --testPathPattern='src.integrations|src.email-intake'`: 23 suites, 242 tests, 22 suites/241 tests passed, one changed-code failure in email-intake.store.spec.ts because nullable informational metadata lacked a null guard (66.557 s). Fixed metadata to use optional slice plus null, preserving the existing 64-character informational column. Full IDs remain in durable queue.
- Backend `npm test -- --runInBand --silent --runTestsByPath src/email-intake/email-intake.store.spec.ts`: final corrected code, 1 suite/8 tests passed, exit 0 (16.327 s). Earlier 22-suite evidence is reused for unchanged inputs; this is mixed-revision evidence, not a claimed full passing run on the final revision.
- Backend `npm run build`: passed, exit 0, including a second build after the metadata correction. No remaining backend compile failures.
- Diagnostic selector `npm test -- --runInBand --silent --testPathPattern='outlook|email-connections|composio-client|integrations.controller|gmail-drive-import|gmail-sync.service|user-integrations|composio-gmail'` unintentionally matched the absolute worktree name and selected unrelated suites. Interrupted (exit 1); not reported as a complete pass. Corrected selector above scopes source directories.
- Frontend `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline`: 1512 packages installed independently, exit 0, after ENOSPC failures with concurrent package installs. Existing Node ^20.11.1 declaration warns under Node 24. Failed partial installs created by this task were removed from this worktree only.
- Frontend `$env:CHROME_BIN='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.email-spec.json --include=src/app/services/integrations.service.spec.ts --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --progress=false`: 14 tests passed in Edge 158 headless, exit 0. This covers Gmail compatibility, Outlook request routing, provider-specific reconnect and owner controls. No manual browser OAuth check performed.
- `git diff --check`: passed during review; final result recorded below.

Known baseline test failures: none claimed. Disk exhaustion is an environment failure. Full repository Jest is not required for the changed provider/intake boundary and was not completed. Live OAuth/scopes/configured toolkit version/download-host response verification and long-ID DB persistence remain unexecuted, pending approval/configuration. No main integration, push or deployment.

- Frontend `npm run build -- --configuration production --progress=false`: exit 1, asset-copy stage failed with ENOSPC while copying src/assets/login_el.svg into dist/app/assets/login_el.svg. This is not a passing production build. The build ran concurrently with a final wording-only correction to generic OAuth failure text; no claim is made that the running build included that correction. No broad rerun was performed under exhausted disk conditions.
- Final `git diff --check`: passed, exit 0. File scope reviewed; no environment secrets, dependencies or generated output are included.
- Removed only this task-created worktree dependencies and generated build/cache directories after verification to restore disk capacity. Dependencies must be installed independently again before further verification.

Result at 139ab18a: implementation checkpoint only; completion was blocked by pending schema-preparation approval and unsuccessful frontend production build. Live configuration/DEV OAuth verification remains outstanding. No main integration, push or deploy. Do not describe this branch as ready to merge.

## Approved schema preparation — 2026-11-23

Elazar explicitly selected preparation only, without application to any database.
Prepared docs/features/outlook-email.sql and appended its exact ALTER statement to
docs/redesign/cutover.sql as required by the root schema-record instructions.
The ALTER changes only email_import_items.message_id to VARCHAR(512) CHARACTER SET
ascii COLLATE ascii_bin NOT NULL. Existing full-column unique index stays intact;
maximum conservative string payload is 1296 bytes for the three indexed columns.
Preconditions: live table/index/row-format inspection, zero non-ASCII/overlength
existing values, separate application approval. No DB connection or SQL execution.

This supersedes the earlier pending-preparation decision only. Application code
and test inputs are unchanged from 139ab18a; reuse prior focused evidence and its
stated limits. Frontend production build remains failed with ENOSPC; no application
tests/builds rerun for this schema/documentation-only follow-up. Static SQL scope,
standalone/cumulative parity, index-size arithmetic, documentation targets and Git
whitespace checks are the focused verification. No main integration, push or deploy.

Verification result: offline Node assertions passed (exit 0): exactly one scoped ALTER,
exact standalone/cutover statement parity, unchanged historical CREATE and full index,
1296-byte index arithmetic and valid documentation file targets. No SQL execution.
Git diff --check passed (exit 0). Application tests/builds skipped as unchanged.


## Approved DEV application, configuration and final automated checks — 2026-11-23

Elazar explicitly approved applying the schema to DEV only, continuing Outlook
configuration/checks, without main integration or push. He has no application
user for the test; an isolated technical DEV owner is used for identity-only OAuth.
The user supplied an Outlook Auth Config ID; it stays only in ignored local .env.

### Database evidence

- `node scripts/apply-outlook-dev-schema.cjs`: default read-only inspection first
  failed EACCES in sandbox, then passed with scoped escalation. Runtime DB
  keepintax-dev, MySQL 8.0.37-google, Dynamic row format, 408 rows, zero non-ASCII
  and overlength IDs, full expected unique index, calculated key payload 1296 bytes.
- `node scripts/apply-outlook-dev-schema.cjs --apply`: exit 0; exactly one ALTER
  applied; verified length 512, ASCII/ascii_bin, 408 before/after rows and plan [].
- Subsequent `node scripts/apply-outlook-dev-schema.cjs`: exit 0, plan [], 410 rows
  under concurrent DEV activity. No DML, backfill, PROD connection or Nest boot.
- `node --test backend/scripts/apply-outlook-dev-schema.test.cjs` from root:
  6 passed, 0 failed, exit 0 (763.4311 ms); offline mocks, no DB access.

### Application verification on unchanged application sources from 420401b3

- Backend `npm ci --no-audit --no-fund --prefer-offline`: exit 0, 1176 packages,
  independent local install; Node 24.13.0 / npm 11.6.2.
- Backend `npm test -- --runInBand --silent --testPathPattern='src.integrations|src.email-intake'`:
  exit 0; all 23 suites / 242 tests passed on one application revision, 164.122 s.
  This supersedes the earlier mixed-revision backend evidence.
- Backend `npm run build`: exit 0.
- Frontend `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline`: exit 0,
  1512 packages; warning for existing frontend Node ^20.11.1 declaration.
- Frontend `npm run build -- --configuration production --progress=false`: exit 0,
  hash 83f103aa921cc7d6, 416222 ms. Unchanged stylesheet budget, CommonJS and initial
  bundle budget warnings. This supersedes the prior ENOSPC build failure.
- Frontend final focused email test command is the same CHROME_BIN/tsconfig/includes
  recorded earlier; latest result recorded below. No unrelated full-suite reruns.

### Composio and OAuth evidence

- Read-only management inspection returned HTTP 403 for the configured Gmail
  baseline and separately for the user-supplied Outlook auth config. Metadata and
  scopes are therefore unverified; no attempt was made to widen the API key.
- `node scripts/configure-outlook-dev.cjs` resolved all five Outlook allowlisted
  tools to 20261120_00 and wrote only Outlook local DEV settings. The helper now
  accepts --auth-config-id or the existing local setting; no ID/key is hardcoded.
- Syntax checks passed for the schema, configuration and connection helper scripts.
- `node scripts/test-outlook-dev-connection.cjs`: provider accepted a hosted auth
  link using the supplied config. Only OAuth state under a technical DEV owner was
  created. Loopback callback listener on 4318 runs for 10 minutes. User Microsoft
  consent/callback verification is still pending. All email tools except profile
  identity are blocked; no import, AI, scheduler, account deletion or message read.
- Computer Use inspection previously stopped because it could not confidently
  determine the browser URL; no browser changes were made through that attempt.

No main integration, push, deployment or production access. Remaining live acceptance:
user Microsoft consent, verified callback/identity and (only under separately agreed
fixture scope) attachment/import checks. Current scripts do not authorize such reads.
Final frontend focused run: same recorded CHROME_BIN and npm test command passed all 14 tests in Edge 158, exit 0. Final node --check passed for all three new operational helpers; git diff --check passed. New helper tests cover only offline schema guards. Local environment remains ignored and is not committed.

## Requested local presentation update — 2026-11-23

Changed the section heading exactly to "חבר את תיבת המייל שלך לטובת משיכת מסמכים".
Added a local Outlook SVG asset and scoped 20px background-icon styling using the
existing ButtonComponent icon input, on both empty-state and existing-account
Outlook connect buttons. No shared button component, handlers, visibility or
connection behavior changed. No schema/provider operation or main integration.

Risk tier: local presentation only. Static Node assertions passed for the exact
heading and both icon bindings; sharp successfully rendered the SVG at 20px and
its enlarged black-background preview was visually inspected. This checks icon
legibility, not a claimed full live Settings browser session. Focused component
command and frontend production build results are recorded below. Backend tests
and builds are reused unchanged; no backend code was edited for this request.

UI verification commands/results (frontend directory unless noted):

- `$env:CHROME_BIN='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.email-spec.json --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --progress=false`: exit 0, exactly 10 component tests passed. Edge launcher warned while cleaning up after successful execution; no unrelated service suites ran.
- `npm run build -- --configuration production --progress=false`: exit 1, ENOSPC in Angular Babel/webpack loader. No code/type error was reported; this attempt is not a passing build.
- Removed only this task's generated frontend/.angular and frontend/dist after the failed build. 2,465,488,896 free bytes afterward. No source/dependencies or other worktrees removed.
- Retrying `$env:CI='true'; npm run build -- --configuration production --progress=false`. Installed Angular normalize-cache.js confirms that CI=true disables its default local-only disk cache without editing angular.json. Result below.
- Final cache-disabled production build: exit 0, hash eda7748066c74f4f, 133648 ms. Existing unchanged CSS/CommonJS/initial-bundle warnings only. No angular.json/configuration source change. Production asset bytes equal the source SVG and the icon binding is present in emitted chunks. Final git diff --check passed. No main integration or push.

## Duplicate provider icon and callback diagnosis — 2026-11-23

User reported both Gmail and Outlook branding on the Outlook button and a return
to backend port 3002. Root causes: settings-new-connections.scss added Gmail via
::after to every black button in .gmail-actions; the Outlook config helper wrote
3002/4202 independently of actual local launch configuration (PORT was 3000,
ignored ports file absent, no listener on 3002/4202 at diagnosis).

Narrowed Gmail decoration to explicit gmail-connect-button controls, marked both
Gmail add-account buttons, and replaced the hand-drawn SVG with the actual Outlook
asset linked on https://www.microsoft.com/en-gb/microsoft-365 (Microsoft CDN
product-icon-M365-Outlook-48x48-1, 8739 bytes, viewBox 0 0 48 48). XML checked for
scripts, foreign objects, embedded images and external references; none present.
Rendered at 20px on black and visually checked. Asset remains local at runtime.

Added real browser cascade regressions using the served actual Settings stylesheet
and rendered ButtonComponent: Outlook has one Outlook icon and no Gmail pseudo-
element/Google image; explicitly marked Gmail retains Gmail; generic import has
no Gmail badge. Existing email component tests run alongside these regressions.

Local configuration correction: created ignored .local-ai-dev/ports.json for
4202/3002, aligned ignored backend/.env PORT and both providers’ local callback/return
URLs, preserving all credentials.
Both files verified ignored. Canonical frontend/backend --print-config commands
confirm frontend 4202, backend 3002, API http://127.0.0.1:3002/. New pure helper
outlook-dev-urls.cjs resolves return URLs using these effective ports rather than
hardcoded feature defaults. No main configuration, app server, DB, account or
callback-state operation was performed. The user-supplied callback was not replayed.
A fresh owner-initiated OAuth attempt is required after correct local app startup;
active connection and end-to-end callback remain unverified.

`node --test backend/scripts/outlook-dev-urls.test.cjs`: exit 0, 4/4 passed,
164.9547 ms; covers PORT/default mismatch, ignored overrides, preserved frontend
route/query and rejected invalid/nonlocal settings. No Nest build/repository Jest
rerun needed for a standalone local helper; app backend source unchanged.
`node frontend/scripts/start-local.js --print-config` and backend
`node scripts/start-watch.js --print-config`: exit 0 with aligned effective ports.
Frontend focused cascade/component tests and production build results below.
No main integration or push. Feature worktree retained because integration is not
approved and OAuth/live fixture acceptance is still pending.


Focused frontend command: `$env:CHROME_BIN='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; npm test -- --watch=false --browsers=ChromeHeadless --karma-config=karma.email-icons.conf.cjs --ts-config=tsconfig.email-icons-spec.json --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --include=src/app/pages/settings-new/email-provider-icons.spec.ts --progress=false`: exit 0, 13/13 passed (10 existing component tests + 3 rendered CSS-cascade regressions), Edge 158 headless.
Production command: `$env:CI='true'; npm run build -- --configuration production --progress=false`; final result below. No unrelated frontend or repository-wide backend suites rerun.
Final production build: exit 0, hash 447bf620a1cbb4b4, 180081 ms. Existing unchanged CSS/CommonJS/initial-bundle warnings. Emitted Outlook SVG equals the Microsoft source asset. Final offline consistency assertion confirms ignored runtime ports match configured Outlook URLs; no server started. git diff --check passed. Application source verification is complete for these corrections; live callback remains pending correct server startup and a fresh consent attempt.

## Requested frontend return-port adjustment — 2026-11-23

Updated both providers' frontend return URLs and ignored local frontend launch
port to Elazar's explicitly requested destination, preserving backend port and
callback URLs. Found an existing frontend listener and left it running unchanged.
Machine-specific destinations remain only in ignored local configuration.

Offline Node assertions passed: both return URL ports match the requested port,
Outlook helper output agrees with the ignored launch settings, backend PORT and
callback are preserved. Canonical frontend and backend --print-config commands
passed and both local configuration files remain ignored. No application code
changed, so no repeated application tests/builds; prior passing evidence applies.
git diff --check passed. No main integration, push, DB/provider call or server boot.

## Requested backend port adjustment and restart — 2026-11-23

Elazar explicitly requested that the running DEV backend use the standard backend port. Updated only ignored local backend/launch configuration and both providers callback URLs; frontend destination preserved. Verified the original listener and watch ancestry belonged to this feature worktree before stopping that exact process tree. Restarted the canonical start-watch entrypoint hidden with logs in ignored .local-ai-dev. Compilation reported 0 errors; bootstrap verified keepintax-dev and synchronize=false; the requested listener is owned by this worktree, and the previous port has no listener. Existing frontend process preserved. No application source change, schema operation, main integration or push. No repeated application suite/build required for this configuration-only restart. Feature worktree now has an active development server and must be retained until it is intentionally stopped before any later authorized cleanup.

## False expiry, durable failure handling and user messages — 2026-11-24

Local changes distinguish transport/configuration access failures from confirmed
mailbox revocation. HTTP 401/403 alone no longer expires a mailbox; confirmed
remote EXPIRED/REVOKED or explicit invalid-grant/token signals still require
reconnection. Account ownership/toolkit/managed-config checks remain enforced.
Structured provider/intake warnings contain operation, stage, run/integration IDs,
category and allowlisted status/code only; no raw errors, credentials, mailbox
contents, addresses, OAuth state or signed URLs. Fatal access/config/auth errors
pause the pull and clear misleading RUNNING status. Other run failures retry at
most five times. Lease-fenced updates preserve cursors and processed documents.
Attachment failures settle before lease release. Shared Hebrew UI messages map
stable error codes and do not claim an unverified permission has expired.

Verification on the consolidated changes before the final local-expiry/lease
correction: backend `npm test -- --runInBand --silent
--testPathPattern='src.integrations|src.email-intake'`: 24 suites, 255 tests,
exit 0, 107.463 s. After that correction, final affected checks:
`npm test -- --runInBand --silent --runTestsByPath
src/email-intake/email-intake-failure.spec.ts
src/email-intake/email-intake-runs.spec.ts`: 2 suites, 16 tests, exit 0, 55.003 s.
Final `npm run build`: exit 0. The 255-test result is not a full final-revision run.
Frontend: CHROME_BIN set to installed Edge, `npm test -- --watch=false
--browsers=ChromeHeadless --ts-config=tsconfig.email-spec.json
--include=src/app/services/integrations.service.spec.ts
--include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts
--progress=false`: 16 tests, exit 0. Final production `npm run build --
--configuration production --progress=false` with CI=true: exit 0, hash
c4a6060648ba237c, 192320 ms; existing CSS/CommonJS/bundle warnings remain.

DEV-only investigation verified the affected managed remote account ACTIVE with
owner/config matching, profile identity matching and a future-only metadata probe
returning zero messages. The guarded recover-outlook-dev-run.cjs defaults to inspect,
requires exact DEV database/settings, global scanner lock, one unleased AUTH retry
and live owner/profile verification before --apply. One repair was applied without
changing frozen query/cursor, items or documents. Another worker restored EXPIRED
and AUTH retry before this local backend finished booting. Attempts also increased
while the verified local process tree was stopped. The repaired local worker then
paused the run as PARTIAL/ACCESS, with last_sync_status ERROR and stable
EMAIL_CONNECTION_UNVERIFIED, zero queued items. Do not repeatedly reset this row.

Read-only exact DEV service inspection found taxmyself-prod/me-west1/
taxmys16elf-dev running taxmys16elf-dev-test-ce70fdf1-1123, minScale=1,
CPU throttling disabled, and DB_DATABASE=keepintax-dev. This is a candidate competing
worker; exact-service filtered recent logs returned no matching intake events, so
its responsibility is not proven. No cloud service/configuration was changed.
The intake enabled() implementation is unconditional, so an unverified legacy env
flag is not a reliable way to stop that scanner. Stable live resumption remains
pending identification/control of the competing DEV worker. The local backend is
running from this feature on port 3000; frontend return remains 4200. No main
integration, push or cloud deployment. Retain the active feature worktree.

## Mixed-version DEV scanner coordination and completed Outlook pull — 2026-11-24

Acceptance: restore the verified Outlook connection; complete the original frozen
run through the provider/download/dedup pipeline without false expiration; preserve
existing documents, cursor/query and authorization; retain backend 3000/frontend
4200; no main integration, push, cloud deployment or production access.

The exact DEV revision ce70fdf1 has an unfiltered cross-integration run selector,
but GmailReaderService constructs a Gmail-only account context. Its managed-account
lookup is filtered to Gmail auth config/toolkit, so it rejects an Outlook connection
as AUTH; ComposioGmailProvider then marks it EXPIRED. This explains the observed
false-expiry/retry mechanism. The live DEV service remains on that revision and
keepintax-dev. No per-run cloud log was available to uniquely attribute the prior
write; attribution to that exact process remains inferential. The independently
observed competing-worker updates and incompatible deployed code are confirmed.

Added explicit local EMAIL_DEV_EXCLUSIVE_SCANNER=true, saved only in ignored
backend/.env. The scanner keeps its existing global gmail-durable-scan lock on one
connection across ticks. Competing cooperating workers skip scanning, while this
worker continues the same bounded/fenced scan pipeline for the shared DEV queue.
Each tick verifies live DATABASE() equals keepintax-dev and confirms retained lock
ownership before reading runs. Production mode, non-dev Composio or enabled schema
synchronization refuse this mode. Ownership loss skips work/releases the runner;
module shutdown releases the advisory lock/connection; process death also releases
its MySQL session lock. Normal scanning behavior is unchanged when not opted in.
This is local DEV coordination, not a cloud rollout: keep this feature server
running for Outlook pulls until all shared DEV scanners support Outlook. Stopping
it allows the legacy scanner to resume. No remote configuration was changed.

Recovery helper now also recognizes the exact paused ACCESS run with
EMAIL_CONNECTION_UNVERIFIED, still requiring local EXPIRED, MICROSOFT, exact owner,
unleased run, active managed remote account and matching profile identity. Updates
are transactional/guarded, preserve query/cursor/items/documents, and defer resumption
120 seconds so the validated local scanner can acquire ownership after startup.
Inspected then applied once to integration 19 / run
d517e89d-f65c-43d1-a1e2-8635d788da2e while the verified feature process was stopped.
Restarted the canonical hidden local watcher. Actual DB inspection confirmed the
held scanner session uses the same peer as the local diagnostic, across ticks.

Live result: ACTIVE connection, last_sync_status SUCCESS, last_sync_error NULL,
scan_state DONE, pull_state COMPLETE, error_code NULL, attempts 0. Three messages
SCANNED and 15 attachments DUPLICATE: bytes were retrieved through the Outlook
adapter/download service and existing content dedup avoided extra documents.
There were no queued failed or unfinished items. This verifies listing, metadata,
attachment download, durable completion and dedup in DEV; it does not independently
exercise creation of a brand-new document or downstream AI processing.

Final focused command (backend): `npm test -- --runInBand --silent
--runTestsByPath src/email-intake/email-scanner-ownership.spec.ts
src/email-intake/email-intake-runs.spec.ts
src/email-intake/email-intake-failure.spec.ts`: exit 0, 3 suites / 21 tests,
15.930 seconds. Covers retained lock, competing owner, wrong DB, production refusal,
lost ownership, shutdown release and existing pull/failure behavior. An initial
invocation before the new test file was written failed ENOENT; its other 16 tests
passed. That setup error was corrected; final combined command above passed.
`npm run build`: exit 0. Canonical watch startup also compiled with 0 errors and
verified keepintax-dev / synchronize=false / listening 3000. Frontend unchanged;
reuse the prior passing 16 focused tests and production build. Recovery helper
syntax checked and live guarded inspect/apply completed. git diff --check passed.
Local watcher root PID 17860 / app PID 31044 at verification; frontend listener
4200 preserved. No merge/main/push/cloud service or schema change in this repair.

## Prepared scoped email workers; DEV schema applied — 2026-11-24

User authorization: implement local/test routing and prepare the same schema for
DEV and production; apply only in DEV. Do not access/modify production, integrate
main or push. No existing-work migration requested. Continue this existing Outlook
feature worktree on codex/outlook-email (base for this change 5ed95648).

Acceptance: server-owned local/test run tags; filter worker selections and direct
claims; propagate email-origin processing/AI/protected-PDF routing; leave production
no-flag behavior compatible; prepare additive SQL for both DBs, apply only DEV;
verify actual MySQL isolation with rollback fixtures, preserve existing records;
keep temporary scanner protection until every shared DEV worker is compatible.
This task covers the email pipeline, not unrelated application background jobs.

Implementation: nullable ASCII worker_scope on email_import_runs and a nonunique
scope/due index. Scope is chosen from trusted server configuration, never request
input. Scoped startup refuses production, non-dev Composio, a different actual DB,
or missing reviewed column. Unset scope retains existing SQL without reading the
new field, adding ORM columns or changing feature availability. Active cross-scope
pulls for the same shared connection conflict instead of returning a foreign run.
Scan/durable work claims are scoped. GMAIL-purpose AI jobs follow their imported
document's owning run in admission, completion, recovery/reporting. Global paid
capacity/two-slot ceiling and shared hash dedup are unchanged. Protected email roots
inherit the run through original_import_id or server-authored metadata.emailRunId
before that pointer exists; direct delivery and due/recovery paths are checked.
Other document jobs/protected sources retain their prior behavior. Scoped local
skips nightly creation; scoped test creates it. No-flag nightly behavior unchanged.

Preflight: no RUNNING/RETRY pull or actionable imported work. Four historical runs
are COMPLETE/PARTIAL with processing ATTENTION; they were not changed or adopted.
Schema helper first refused because the stopped feature scanner's idle MySQL
session still held the named lock. Read-only DB/process/socket checks isolated its
exact same-peer keepintax-dev session 6364928; it was Sleep for 734 seconds with
zero active transactions and no feature listener. Killed only that stale DEV
connection, then reacquired the scanner lock. A separate fee-feature backend was
identified and preserved; this further reinforces that all shared DEV workers,
not only cloud test, must be updated/configured for routing.

`node scripts/apply-email-worker-scope-dev.cjs`: inspect exit 0. Actual database
keepintax-dev, MySQL 8.0.37-google, 14 runs, zero pending pulls. After the safe-lock
refusal was resolved, `node scripts/apply-email-worker-scope-dev.cjs --apply`:
exit 0, exactly one additive online ALTER applied, exact column/index verified,
14 runs before/after, plan []. Final inspect also plan []. No data backfill,
UPDATE/DELETE of historical rows or production operation. Standalone SQL is
/docs/features/email-worker-scope.sql and the exact executable DDL is appended to
/docs/redesign/cutover.sql as a preparation record, not an automatic runner.

Verification (backend workdir unless path prefixed):
- `node --test scripts/apply-email-worker-scope-dev.test.cjs`: exit 0, 6 tests,
  93.9141 ms. Covers missing/existing schema, drift/partial shape, safe config and
  actual DB refusal. No production access.
- `npm test -- --runInBand --silent --runTestsByPath src/email-intake/email-worker-scope.spec.ts`:
  exit 0, 12 tests, 70.932 s cold compilation.
- `npm test -- --runInBand --silent --testPathPattern='src.email-intake|src.document-ai|src.protected-pdf|gmail-sync-cron.service.spec.ts'`:
  exit 0, 30 suites / 234 tests, 85.850 s. Includes no-flag production behavior,
  scoped claim/creation, nightly policy, failure/fencing, protected PDF and shared
  AI admission/cancellation regressions. Expected synthetic cancellation logs are
  not failures. No unrelated repository-wide tests were run.
- `npm run build`: exit 0 on the final application sources. Later changes are
  test/helper/documentation only. Frontend unchanged; no repeated Angular checks.
- `node scripts/verify-email-worker-scope-dev.cjs --rollback-probe`: exit 0, then
  repeated only after adding its idle-queue safety preflight (exit 0 again).
  Compiled stores executed real MySQL local/test/NULL fixture selections and direct
  claims, downstream work, AI admission/completion, stale recovery, protected roots
  including metadata fallback, and operations. Foreign/unscoped claims rejected.
  All fixtures verified absent after rollback; 0 provider/Drive/paid AI calls.
  Synthetic auto-increment reservations may leave harmless ID gaps. All live
  assertions ran against DEV, not production or a mocked SQL contract.
- `node --check scripts/verify-email-worker-scope-dev.cjs`: exit 0.
- `git diff --check`: passed. New documentation relative targets verified locally.

Runtime activation is intentionally pending: old shared DEV binaries ignore the
new column and would still consume other scopes. User asked to prepare code and
apply schema, not deploy test/cloud. No live cloud setting or source delivery was
changed. Ignored local .env keeps EMAIL_WORKER_SCOPE unset and the already-approved
EMAIL_DEV_EXCLUSIVE_SCANNER=true protection. The canonical local watcher was
restarted after verification; port and bootstrap verification recorded below.
See docs/features/email-worker-scope.md for exact all-worker activation order and
production compatibility/approval boundaries. No merge/main/push. Retain worktree.

Runtime verification: canonical watch compilation 0 errors; DB keepintax-dev, synchronize=false; backend 3000 owned by feature app PID 28136 (watch root 7828), frontend 4200 preserved. No unexpected boot errors; existing unrelated orphan-business OCR warnings and unconfigured Document AI warning remain. Scope flag remains unset and temporary exclusive scanner protection remains configured. No new executable changes after the passing build/regression run.

## OAuth Back/cancel leaves connection controls spinning — 2026-11-24

User reported returning from Add Outlook without authorizing another account left
both provider buttons spinning. The component set its shared connecting flag before
requesting the hosted URL and only cleared it on HTTP error. Successful navigation
left transient state true, which browser-history restoration can preserve.
Acceptance: Back/cancel restores usable controls, retry is possible, loading is
limited to the selected provider, and server-verified account refresh/owner-only
mail access remain enforced. No backend, DB, credential or provider changes.

Connecting state now records only the pending provider. It resets before external
navigation and on request finalization (including error/empty completion). A window
pageshow listener clears stale state on persisted history restoration and refreshes
server state only for the owner. Ordinary pageshow does not cancel an active request.
Both provider buttons still share the in-flight duplicate-request guard, but only
the selected provider shows its spinner. Incoming callback parameters are not
interpreted as proof of a connected account. No remote connection is deleted.

Focused frontend command: CHROME_BIN set to installed Edge, then
`npm test -- --watch=false --browsers=ChromeHeadless --karma-config=karma.email-icons.conf.cjs --ts-config=tsconfig.email-icons-spec.json --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --include=src/app/pages/settings-new/email-provider-icons.spec.ts --progress=false`:
exit 0, 19/19 passed on Edge 158 headless (16 component + 3 actual stylesheet/icon
regressions). New tests cover reset before navigation, retry after Back, persisted
restore, ordinary pageshow, represented-client guard and error/empty responses.
Navigation and return events were simulated in browser tests; no real OAuth consent
flow was executed. No backend suite/schema probe rerun: backend is unchanged.
One existing comment was relocated after testing; executable inputs unchanged.
`git diff --check` passed. Production frontend build result recorded below.
No main integration, push, cloud deployment or local backend restart.

Final frontend production command: CI=true, npm run build -- --configuration production --progress=false. Exit 0, hash 9ce56e0795be6f4f, 125035 ms. Existing CSS-budget/CommonJS/initial-bundle warnings remain. No repeated tests/build after comment-only relocation. Application diff reviewed and git diff --check passed.

## Authorized local main integration — 2026-11-24

Elazar explicitly authorized merging to main and then deleting the unrelated main
backend/journey-timings.local performance log. Deleted exactly that 4371-byte file;
no tracked main source was discarded. Main preflight was 2eedefa7, feature e00447b3.
Fresh origin/main was 7deef507: main had ten local commits and six upstream commits.
Merged both histories into the feature candidate without reset/rewrite: 18fbb4a9
combines local main, 49c0e208 combines origin/main. Main stays untouched until final
verification/fast-forward. No push authorized or attempted.

Resolved conflicts preserving Gmail business routing, canonical redesigned Settings,
latest per-account summaries, provider-aware Outlook OAuth, safe failures, worker
routing and Back/cancel reset. Outlook connect now accepts the same owned-business
selection, binds it to Microsoft OAuth state, and forwards it through the UI/service.
Routing settings recognize both email providers. Outlook rechecks current sender
blocking before attachment metadata/download and again before signed byte retrieval;
missing sender fails closed when block rules exist. Run scope follows immutable
run ID/owner even when existing business routing moves an import to another owned
business; current work/job business fences remain. Tests cover these interactions.

Main port gate: canonical print-config before integration reported frontend 4200,
backend 3000, API http://localhost:3000/, synchronize=false. Feature overrides remain
ignored; they are not staged or substituted for main defaults. The feature watcher
(root 7828/app 28136) and frontend 21916 were verified by exact worktree command
lines and stopped before changing source. Other feature servers were preserved.
Read-only DEV metadata confirmed all previously introduced Gmail routing JSON
columns and OAuth business_number already exist. No schema/data operation occurred
as part of integration, and no production access or cloud deployment occurred.

Verification on the combined candidate:
- backend npm ci --no-audit --no-fund: exit 0, 1177 packages, 1 minute, existing
  dependency deprecation warnings. Isolated feature dependencies only.
- backend `npm test -- --runInBand --silent --testPathPattern='src.integrations|src.email-intake|src.document-ai|src.protected-pdf'`:
  exit 0, 49 suites / 483 tests, 84.318 s. After adding explicit Outlook business
  input validation and final tests, reran only affected boundaries below; do not
  describe the 483-test result as a complete final-revision run.
- backend `npm test -- --runInBand --silent --runTestsByPath src/integrations/integrations.controller.spec.ts src/integrations/services/email-connections.service.spec.ts src/email-intake/email-routing.service.spec.ts src/integrations/providers/composio-outlook.provider.spec.ts src/email-intake/email-worker-scope.spec.ts`:
  exit 0, 5 suites / 65 tests, 94.907 s on final executable sources.
- backend npm run build: exit 0 on final executable sources.
- frontend Edge-headless rendered component/icon command from the prior section:
  exit 0, 29 tests on the combined candidate. Final focused command:
  `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.email-spec.json --include=src/app/services/integrations.service.spec.ts --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --progress=false`:
  exit 0, 33 tests, including forwarding Outlook business selection. Existing
  reactive-form disabled-attribute warnings remain; no failing cases.
- frontend CI=true, `npm run build -- --configuration production --progress=false`:
  exit 0, hash 2573ef41ccba3c80, 145836 ms; existing budgets/CommonJS warnings.
  Later frontend edits were tests and a comment relocation only.
- `node --test backend/scripts/apply-email-worker-scope-dev.test.cjs backend/scripts/apply-outlook-dev-schema.test.cjs backend/scripts/outlook-dev-urls.test.cjs backend/scripts/check-agent-image.test.cjs`:
  exit 0, 21 tests, 1102.7765 ms. No live schema/provider checks rerun.
- git diff --check passed. No accounting algorithms, paid outcome policy, owner
  restrictions, credentials, production callbacks or remote configuration changed.

Private cleanup backup prepared at
C:/Users/user/.codex/backups/keepintax-outlook-email-20261124-main-integration,
restricted to current user and SYSTEM. Feature backend/.env and original main
backend/.env hash-verified without exposing content; ignored local config/evidence
will be copied/verified before worktree removal. Main already uses keepintax-dev,
COMPOSIO_ENVIRONMENT=dev, and matching Composio key/Gmail auth config. Outlook is
not yet configured in main's ignored environment. Move only the four approved
local Outlook settings and temporary DEV scanner ownership there, preserving all
existing secrets and port defaults. EMAIL_WORKER_SCOPE remains unset: old shared
DEV servers have not been upgraded, so the temporary protection is still needed.
Final fast-forward, launch and cleanup evidence follows after completion.

### Main delivered and runtime handoff

Fast-forwarded primary local main from 2eedefa7 to abc960c9 after verifying main
was unchanged/clean, candidate includes fetched origin/main, both package builds,
combined/final focused tests and canonical port defaults. No push/deployment.
Copied only the four approved local Outlook settings plus the existing temporary
EMAIL_DEV_EXCLUSIVE_SCANNER=true protection into main's ignored backend/.env.
Original main .env was privately backed up and hash-verified first. Existing
credentials/Gmail configuration and port defaults were preserved; verified matching
DEV Composio key and environment before copying. EMAIL_WORKER_SCOPE remains unset.
No provider credential or remote callback configuration was changed.

Main server launch was safely refused before starting processes: ports 3000 and
4200 had meanwhile been claimed by TaxMyself-ai-module, app PID 29868 and Angular
PID 30204. Verified both by full command lines; did not stop or restart them. Thus
the listeners currently serving those ports are NOT main. Main's configuration is
ready, but manual acceptance requires deliberately switching to its servers after
that other task releases the ports. No claim of live main/OAuth acceptance is made.
The user's Outlook disconnect stays confirmed; no mailbox was reconnected.

Main cleanup preflight confirmed the feature checkout exactly matches abc960c9,
branch codex/outlook-email, no tracked/untracked changes, and no node/cmd process
still referencing it. Ignored inventory was only backend/.env, .local-ai-dev and
reproducible dependencies/build caches. Backup verified all seven local config/log
files and backend/.env under the private backup location above. Measured logical
worktree file size before removal: 4,563,802,618 bytes (~4.56 GB). Started ordinary
`git worktree remove C:/Users/user/Keepintax/TaxMyself-outlook-email`, without force;
final removal verification is recorded below. Feature branch/commits are retained.
Code tests/builds remain applicable: subsequent main edits are documentation only.

Cleanup completed successfully: non-forced git worktree remove returned exit 0; the exact feature directory no longer exists and is absent from git worktree list. Branch codex/outlook-email remains at abc960c9, included in main. Private environment/config/log backup remains verified outside Git. Approximately 4.56 GB of logical worktree files/dependencies were removed. The primary checkout and other worktrees/servers were preserved. No push, remote branch deletion or production operation. Final delivery includes this documentation-only completion record.
