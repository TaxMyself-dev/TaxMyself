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
- No main integration, push, deployment, production access or applied schema changes.

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
- Required next step: separate approval before applying DEV schema, enabling the integration and connecting a synthetic DEV mailbox. Verify live contracts and Drive operations there before any integration request.

## Follow-up: configuration-only environment separation

- Removed the persisted environment property from the entity, upsert input/storage and both prepared SQL copies. DEV and PROD already have separate databases; Composio projects/keys/auth configs remain separate server configuration.
- Reader and disconnect contexts derive environment from server configuration. User/account ownership checks, configured-environment validation and Composio user-ID namespaces remain enforced.
- Updated fixtures to omit the removed property. Reader tests now verify configured environment propagation without a database environment field.
- Verification on this follow-up: `npm test -- --runInBand --silent --testPathPattern='user-integrations\|gmail-reader\|email-connections\|composio-gmail\|composio-client'` passed 5 suites / 56 tests, exit 0, 45.83 seconds. `npm run build` passed, exit 0. `git diff --check` passed. Frontend and shared importer unchanged; their earlier passing evidence was not rerun or presented as a new full run.
- No database connection or SQL application occurred. The user simultaneously requested no database changes and DB implementation; a clarification was requested before any live schema operation. No main integration, push, deploy or mailbox connection is authorized by this follow-up.
