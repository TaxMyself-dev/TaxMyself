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
