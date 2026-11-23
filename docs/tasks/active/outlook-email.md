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
