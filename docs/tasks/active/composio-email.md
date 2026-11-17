# Composio managed Gmail integration

- Status: `LOCAL_COMPLETE` (live DEV verification awaits separate approval)
- Worktree: TaxMyself-composio-email
- Branch: codex/composio-email
- Base commit: 05a87b662ef87dbb214f1745285091425ba6c45b (verified local main; remote divergence preserved)

## Acceptance criteria

- New Gmail connections use Composio managed OAuth; multiple mailboxes remain isolated.
- No live mailbox connection or provider execution without Elazar's separate approval.
- Preserve attachment filtering, document import, per-business dedup and Drive credentials.
- Failed message reads never advance the sync cursor.
- Read-only allowlisted provider interface with mocked focused tests and builds.
- No main integration, push, deployment or production access. DEV schema application requires separate explicit approval, recorded below.

## Milestones

- [x] Created and attached an isolated feature worktree from verified local main.
- [x] Copied ignored backend environment without printing secrets; disabled Composio and automatic schema synchronization locally.
- [x] Added pinned official SDK, managed connection lifecycle and additive schema script (not applied).
- [x] Added provider-neutral read interface, explicit-account allowlist and bounded descriptor downloads.
- [x] Preserved filters, shared document import and Drive; fixed partial-sync cursor advancement and atomic run claims.
- [x] Added owner-only frontend/backend controls, explicit reconnect identity and retryable remote disconnect.
- [x] Backend focused tests/build and focused headless frontend tests passed.
- [x] Final Angular build passed; implementation prepared for local feature commit.
- [ ] Approved live DEV verification (not authorized; no mailbox was connected).

## Initial implementation verification evidence (c73c8790)

All paths below are relative to the feature worktree. No app boot or real database/provider execution occurred.

| Directory | Exact command | Result |
|---|---|---|
| backend | `npm test -- --runInBand --silent --testPathPattern='integrations\|document-import'` | Final backend code: 14 suites, 160 tests passed, exit 0, 49.222 seconds |
| backend | `npm run build` | Final backend code: Nest build passed, exit 0 |
| frontend | `npm ci --ignore-scripts --no-audit --no-fund` | Final repaired lock installed independently: 1505 packages, exit 0 |
| frontend | `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.email-spec.json --include=src/app/services/integrations.service.spec.ts --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --progress=false` | Final frontend code and lock: 6 tests passed, exit 0; launcher used SIGKILL after its normal browser cleanup timeout |
| frontend | `npm run build -- --configuration production --progress=false` | Final frontend code/lock: passed, exit 0, 122425 ms, hash e1b56130f9df878c; CSS-budget/CommonJS warnings in unchanged styles/dependencies |
| root | `git diff --check` | Passed; repeated after documentation before commit |

### Diagnostic history (earlier revisions, not final verification)

- Initial backend run passed 148 tests. Later lifecycle changes temporarily failed TypeScript compilation because TypeORM Repository.update does not accept OR criteria arrays; replaced with a conditional QueryBuilder update.
- Two new partial-sync tests initially failed because the mocked markSyncError returned undefined instead of a Promise; corrected the mock. Final 160-test run includes these tests.
- Initial frontend npm ci failed due to missing encoding lock entries; retained existing metadata and added only encoding/iconv-lite entries. Exact-lock npm ci subsequently passed.
- First isolated frontend test compile lacked Node declaration types used by an existing imported service; added them to the focused test config. Final focused tests executed successfully.
- One test invocation with --port=9877 failed because this Angular builder does not accept that flag; reran without it. No application server was started.
- Earlier Angular build passed with existing CSS-budget/CommonJS warnings, but preceded final UI changes; it is not the final-build evidence.

## Review and remaining gates

- User explicitly approved implementation/schema preparation/external SDK contract, but prohibited main integration, push, deploy and live mailbox connection. These override repository automatic delivery and production-copy instructions.
- Main remains at the base commit. Only an untracked attachment directory existed there; it was preserved. Remote main had diverged, so no remote changes were integrated into local main or this feature.
- Local Node: 24.13.0, npm: 11.6.2. Backend SDK requires >=22.22.3 and Docker now specifies it. Container build was not run. Frontend's existing Node 20 engine declaration warns under Node 24; builds/tests are reported with the actual runtime.
- No schema script was applied, no PROD data accessed, and no live scopes, quota, MIME, signed download URL, provider retention or callback behavior was tested.
- Full repository test suites were not run: scoped integration/document-import regressions and both builds are the relevant checks. No baseline application-test failures are claimed.
- Drive and DocumentImportService implementation files have no diff. Legacy Gmail OAuth/token handling was removed; Drive OAuth configuration remains required.
- Feature documentation: `docs/features/composio-email.md`; schema: `docs/features/composio-email.sql` plus additive cutover block; server configuration: `backend/.env.composio.example`.

## Handoff

- Result: authorized local implementation and mocked verification complete; live readiness deliberately pending.
- Commit: see this task's local feature commit; no merge, push or deploy.
- Schema / production impact: additive prepared SQL only; no database contacted or modified.
- Security / external impact: official SDK and managed OAuth/read-only adapter, explicit user/account/environment scoping, owner-only mailbox access, bounded safe downloads. Google permissions and provider data handling still require live/product review before production.
- Accounting impact: no changes to recognition, journals, reports, dedup semantics or the shared document processor.
- Required next step: DEV schema was subsequently applied under the explicit approval recorded below. Separate approval is still required before enabling the integration and connecting a synthetic DEV mailbox. Verify live contracts and Drive operations there before any integration request.

## Follow-up: configuration-only environment separation

- Removed the persisted environment property from the entity, upsert input/storage and both prepared SQL copies. DEV and PROD already have separate databases; Composio projects/keys/auth configs remain separate server configuration.
- Reader and disconnect contexts derive environment from server configuration. User/account ownership checks, configured-environment validation and Composio user-ID namespaces remain enforced.
- Updated fixtures to omit the removed property. Reader tests now verify configured environment propagation without a database environment field.
- Verification on this follow-up: `npm test -- --runInBand --silent --testPathPattern='user-integrations\|gmail-reader\|email-connections\|composio-gmail\|composio-client'` passed 5 suites / 56 tests, exit 0, 45.83 seconds. `npm run build` passed, exit 0. `git diff --check` passed. Frontend and shared importer unchanged; their earlier passing evidence was not rerun or presented as a new full run.
- No database connection or SQL application occurred. The user simultaneously requested no database changes and DB implementation; a clarification was requested before any live schema operation. No main integration, push, deploy or mailbox connection is authorized by this follow-up.

## Approved DEV-only schema application — 2026-11-17

- User clarified explicitly: apply the schema to DEV only. This supersedes the earlier no-database-change restriction solely for this additive DEV schema operation. Mailbox authorization, provider execution, main integration, push, deployment and PROD access remain prohibited.
- Added `backend/scripts/apply-composio-dev-schema.cjs`: fixed local configuration, exact `keepintax-dev` allowlist and runtime identity verification, no application boot, metadata preflight of both tables, existing-definition validation, duplicate-pointer check, idempotent missing-addition plan and a maintenance lock for application.
- `node scripts/apply-composio-dev-schema.cjs`: inspection passed, database `keepintax-dev`, MySQL `8.0.37-google`, both baseline tables existed, two additive statements planned. Initial sandboxed attempt failed with EACCES; the same read-only operation succeeded with scoped escalation.
- `node scripts/apply-composio-dev-schema.cjs --apply`: exit 0; exactly two ALTER TABLE statements applied; verified all seven expected new columns and the unique connected-account index. No environment column added. No UPDATE, DELETE, INSERT or backfill statements were issued.
- The approved schema has five new user_integrations columns, two new oauth_states columns and one unique index. Existing data and legacy columns were preserved. No PROD connection, mailbox connection or Composio call occurred.
- Documentation and SQL execution-status comments updated. Application tests/build evidence from the column-removal revision remains applicable: no application source changed in this DB-operation follow-up.
- Final read-only inspection returned `plan: []`, exit 0. `node --check backend/scripts/apply-composio-dev-schema.cjs` and `git diff --check` passed.

## Approved connection-only DEV diagnostic — 2026-11-17

- User approved connecting only a dedicated DEV Gmail mailbox and checking identity; no message search/read/download/import or production access.
- Validated credential presence without displaying values: database keepintax-dev, environment dev, synchronize disabled, persistent integration flag still false. Existing Node 24.13.0 used; no runtime upgrade or full application boot.
- DEV key can read tool metadata. GMAIL_WHO_AM_I was available at toolkit version 20261116_00. No mailbox tool was executed.
- Added `backend/scripts/test-composio-dev-connection.cjs`, an explicit diagnostic with loopback callback port 4317, fresh synthetic DEV identity, only the two integration entities/repositories (synchronize/migrations disabled), and actual connection services. The SDK execution boundary rejects every tool except GMAIL_WHO_AM_I; connection deletion is also blocked. No application module, scheduler, reader or importer is loaded. Persistent .env remains unchanged; feature enablement is process-local only.
- First attempt exposed and corrected a TypeORM raw-result destructuring error before connection creation. Its process was terminated. Subsequent attempts failed at link creation; redacted diagnostics established the exact cause rather than broadening permissions speculatively.
- Blocker: POST /api/v3/connected_accounts/link returns HTTP 403, APIKey_InsufficientPermissions (code 812), explicitly stating that connected_accounts has read access but requires write. User must replace the DEV key with one granting Connected accounts Read + Write. Existing user approval remains sufficient to resume the same connection-only diagnostic after replacement.
- No consent URL was obtained, no Gmail connection or identity tool execution occurred, no imported-document/user data was changed. Only short-lived diagnostic OAuth attempt states were created in DEV. The failed diagnostic listener and database pool were closed. No main integration, push or deploy.

## Replacement-key connection attempt — 2026-11-18

- User replaced the DEV key and renewed connection-only approval. Link creation succeeded; user completed Google consent through the returned hosted link.
- Callback passed Composio ACTIVE/ownership/auth-config verification and executed GMAIL_WHO_AM_I exactly once. Search/read-message/download/import executions: zero; no scheduler or full application boot.
- Final KeepInTax persistence failed with ConflictException: the mailbox's stable Google identity already belongs to another DEV integration owner. Read-only inspection of the single conflicting integration (local ID 17) confirmed GOOGLE, REVOKED, no Composio backend/account pointer and historical initial import completed. The owner is not a synthetic diagnostic user.
- This does not contradict the absence of currently connected Gmail users: the conflicting record is a disconnected historical connection. Do not delete its history, reassign ownership or weaken the global mailbox-ownership constraint as a diagnostic shortcut.
- Result: external DEV OAuth and identity verification succeeded at callback time; local activation under the fresh synthetic user did not succeed. No mailbox messages were accessed and no existing integration/user/document records were changed. A subsequent application connection should use the authorized DEV owner context, or a different clean test mailbox, rather than silently taking over the historical row.
- No key/auth-config change is required for this failure. The diagnostic listener was stopped after inspection; the new external grant was not revoked automatically.

## Existing-owner connection-only diagnostic — 2026-11-18

- User expressly authorized using the existing DEV owner of integration 17, without ownership reassignment or history deletion. Diagnostic now accepts `--integration-id=17`, loads that row only from keepintax-dev, passes its owner and selected integration to the existing reconnect flow, and snapshots all sync/history fields plus owner/account identity for comparison after callback. Other provider tools and connection deletion remain blocked.
- The first existing-owner attempt expired without a callback result. Read-only inspection confirmed that the local row remains REVOKED with no managed connection pointer and historical import/cursor still present. The exact bound Composio account was found with status EXPIRED; its managed auth config is enabled. No Gmail tool was executed during this inspection (the attempted ACTIVE check failed before identity execution).
- A fresh consent link is required; expired state is not renewed, bypassed or used to force local activation. User must finish the newest link and wait for the loopback callback's success message. Persistent feature flag remains disabled and no scheduler/app is booted.
- `node --check backend/scripts/test-composio-dev-connection.cjs` passed; no application source changed, so prior application tests/builds were not rerun. Successful local activation/history comparison remains pending user consent on a valid attempt.

## Successful existing-owner DEV connection verification — 2026-11-18

- User completed the fresh consent link and saw the local success page. Diagnostic callback reported connected in keepintax-dev, existing integration ID 17, verified mailbox identity, no locally stored tokens, original owner preserved and exact history snapshot comparison passed.
- The history comparison includes original integration ID, Firebase owner and Google account identity, initial-import completion/date range, last-sync start/status/error, successful-sync cursor and creation date. It reported historyPreserved=true and existingOwnerPreserved=true; no ownership transfer or history reset occurred.
- Callback executed GMAIL_WHO_AM_I once only. Search/message-read/attachment-download/import executions: zero. No app or scheduler was started and no production access occurred.
- Independent read-only verification after callback confirmed local status ACTIVE, connection backend COMPOSIO, Composio status ACTIVE, managed/enabled matching auth config and user-scoped account membership, verification timestamp, and retained historical import/cursor. This follow-up executed no Gmail tool.
- Persistent COMPOSIO_EMAIL_ENABLED remains false. The loopback diagnostic server was stopped after successful verification. No import or nightly sync was enabled by this test. The DEV connection remains active for future separately approved tests.
- Documentation-only follow-up: prior executable checks retained; no redundant application tests/builds. No main integration, push or deploy.

## Artificial-mail read/download verification — 2026-11-18

- User explicitly authorized only the supplied artificial fixture: exact subject `KEEPINTAX-DEV-TEST`, attachment `keepintax-dev-test.pdf`, using the existing DEV integration 17. No Drive, document import, scheduler, PROD, main integration, push or deploy.
- Added isolated diagnostic `backend/scripts/test-composio-dev-mail-read.cjs`. It loads only the integration entity, Composio adapter and bounded downloader; guards the fixed local DEV configuration/database; scopes the existing owner/account; blocks non-fixture tool calls and connection creation/deletion; performs no database writes. Persistent `.env` and the disabled feature flag remain unchanged. The observed exact storage hostname is allowlisted in this diagnostic process only.
- Initial live attempt: fixture search/read and attachment tool succeeded; byte download correctly failed CONFIG because the storage hostname was not configured. Second attempt with the exact authenticated response hostname allowlisted timed out. DNS/TCP diagnostics confirmed IPv6 addresses resolve but cannot connect, while IPv4 TCP 443 succeeds. No signed URLs, message content or secrets were logged.
- Downloader now prefers public IPv4 when available, after validating ALL returned DNS addresses against the existing public-address policy. Existing exact-host, HTTPS, port, redirect, size and timeout protections remain. Added focused regression coverage.
- Final live command from backend: `node scripts/test-composio-dev-mail-read.cjs` passed using toolkit version `20261116_00`: one matching message, one full message read, one attachment-tool execution in the successful run. Downloaded 43,527 bytes into memory, PDF signature verified, SHA-256 `024e5ece54e5d8d116f632419ef4072cca90549e47c5a65eaf03c709a0e661d2`. Across all three diagnostic attempts, each of the three Gmail tools executed three times; only the final byte download succeeded. No further messages/pagination were accessed.
- Exact serialized integration record before/after final run matched, including owner and history. No local file saved. Drive operations/imports zero; scheduler/application never started. All diagnostic processes/database connections closed.
- Verification on final behavioral changes: `npm test -- --runInBand --silent --testPathPattern='email-attachment-download.service.spec|composio-gmail.provider.spec'` passed 2 suites / 23 tests; `npm run build` passed; `node --check backend/scripts/test-composio-dev-mail-read.cjs` passed. One initial edit command used incorrect relative paths and made no edits; its redundant test/build also completed successfully. Only whitespace normalization followed passing tests. Frontend unchanged; prior frontend evidence reused rather than rerun. No full-suite or Docker validation performed for this scoped fix.
- Composio file handling documentation confirms presigned object-storage URLs: https://docs.composio.dev/reference/v3/api-reference/files . The observed R2 host is corroborated in the provider's issue tracker: https://github.com/ComposioHQ/composio/issues/3477 . Production host policy, URL lifetime and storage retention still need separate review; no permanent host setting was silently enabled.

## Approved single normal DEV import — 2026-11-18

- User explicitly selected business 5 (נגרות) and permitted possible existing automatic AI processing, while retaining no PROD/main integration/push. No AI or scheduler was invoked by this diagnostic. Separate processes may subsequently process the inbox under the existing application behavior; their activity was not measured here.
- Added `backend/scripts/test-composio-dev-single-import.cjs`, requiring explicit `--run`, fixed local keepintax-dev configuration with synchronize/migrations disabled and permanent feature flag disabled. It loads the compiled existing services directly, not AppModule: GmailDriveImportService.importAllForUser -> GmailReaderService -> ComposioGmailProvider -> DocumentImportService -> GoogleDriveService. No production credentials/database are loaded, no schema changes, no initial/nightly sync, no application/scheduler boot.
- Preflight confirmed integration 17 active, owned by the selected business's user; business 5 name נגרות; both destination folders already provisioned. Verified actual Drive folder ancestry to the exact configured root named KeepInTax-Clients-Dev before permitting upload. Existing fixture SHA-256 had no ledger row for this owner/business. No business folder/configuration changes or automatic resolution among the user's two PRIMARY businesses.
- Diagnostic scopes the exact subject KEEPINTAX-DEV-TEST and filename keepintax-dev-test.pdf with maxMessages=1, one execution per read tool, one upload maximum, exact expected size/hash and only selected business folders. Normal accounting-document filtering was used unchanged. Connection creation/deletion and folder provisioning blocked. Normal fresh-upload compensation is limited to the current diagnostic's own uploaded ID.
- Command `node backend/scripts/test-composio-dev-single-import.cjs --run` from feature root PASSED, exit 0: 1 message, 1 attachment, 1 imported, 0 duplicates, 0 skipped, 0 message failures. One execution each of GMAIL_FETCH_EMAILS, GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID and GMAIL_GET_ATTACHMENT; 1 Drive upload.
- Created DEV imported_documents row 194, source GMAIL, correctly scoped to business 5 and the existing owner. Drive file ID 1lEgkQEnxMStU-IQGBSXMpQrS_DFrqR_a; filename keepintax-dev-test.pdf; size 43,527. Verified live Drive parents equal selected inbox, not trashed; downloaded Drive bytes SHA-256 matched 024e5ece54e5d8d116f632419ef4072cca90549e47c5a65eaf03c709a0e661d2.
- Normal manual import updated lastSyncStartedAt, lastSyncStatus=SUCCESS and lastSyncError=null on integration 17. Verified owner, Google account identity, Composio pointer, initial-import range/completion and lastSuccessfulSyncAt cursor unchanged. Entire business record unchanged. No cleanup deletion or repeat import was performed; test file/ledger deliberately remain.
- `node --check backend/scripts/test-composio-dev-single-import.cjs` and `git diff --check` passed. Post-run logging was narrowed to counters (no mailbox address/raw error output). No production source changed, so prior passing 23 focused tests and backend build at a3c8a793 are reused; no new build/full suite/frontend checks were needed for this diagnostic-only addition. All database connections closed. No merge, push or deploy.

## Independent nightly opt-in — 2026-11-18

- User approved adding a separate switch. GmailSyncCronService now requires both COMPOSIO_EMAIL_ENABLED=true and GMAIL_NIGHTLY_SYNC_ENABLED=true before querying eligible connections. Missing/false/other values disable nightly imports. Manual and initial imports remain unchanged; separate Drive OCR is not controlled by this flag.
- Updated server example and feature documentation. No ignored .env changes, schema/database changes, mailbox execution, application start, PROD access, integration into main, push or deploy.
- Final behavioral verification from backend: `npm test -- --runInBand --silent --testPathPattern='gmail-sync-cron.service.spec|gmail-sync.service.spec'` passed 2 suites / 10 tests, 44.683 seconds. Expected synthetic failure-path Nest logs occurred in passing cursor-preservation tests. `npm run build` passed exit 0. `git diff --check` passed. No frontend changes; prior frontend evidence reused.
- Mailbox/business association discussed only: recommend explicit per-mailbox destination business with ownership validation, multiple mailboxes per business, identical routing across manual/initial/nightly import, no fallback when ambiguous, and no retroactive reassignment of imported documents. Shared-mailbox routing remains a separate product decision. No association schema/code was implemented in this change.

## Local UI ports — 2026-11-18

- User requested this feature worktree use frontend 4202 and backend 3002. Default frontend npm start now specifies 4202; development environment API URL points to localhost:3002. Ignored backend .env PORT=3002, Composio callback localhost:3002/integrations/google/callback, frontend return localhost:4202/settings?tab=permissions. Updated the Composio example callback URLs. Other worktrees and production environment files untouched; unrelated billing/mobile start scripts unchanged.
- Start from this worktree: backend `npm run start:watch`; frontend `npm start`. No server was started or restarted. Composio enablement remains unchanged; missing permanent toolkit/download-host settings from the earlier UI-readiness review are not filled by a port-only change.
- Verification: parsed frontend package JSON and local dotenv, asserted all five requested port/URL values plus keepintax-dev database identity; passed. Backend .env verified git-ignored. git diff --check passed. No build/tests needed for these configuration-only changes; no DB/provider calls, main integration, push or deploy.
