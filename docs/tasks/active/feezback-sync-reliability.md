# Feezback consent and ingestion reliability

- Status: `WORKER_COMPLETE`
- Task manager / implementer: Codex, this task; no delegated workers.
- Worktree: TaxMyself-feezback-sync-reliability
- Branch: codex/feezback-sync-reliability
- Base commit: ecdc1455a30e921a8c89189b549dd3a641c8956d

## Dev login blocker follow-up — 2026-11-01

- User reported `TypeError: guard is not a function` during post-login navigation. The protected shell registered AuthGuard as canActivateChild, but the class implemented only canActivate; Angular attempted to invoke the injected object as a functional guard.
- Implemented both router interfaces and delegated canActivateChild to the existing startup/session/profile/MFA checks. No authentication, delegation or entitlement policy changed, and no guard was removed or bypassed.
- Added real-router regressions for successful navigation, signed-out redirection, missing/unfinished MFA, profile restoration and denied offline navigation. Angular may evaluate sibling guards concurrently; the offline assertion checks navigation cancellation rather than assuming execution order.
- Verification: 12 focused authentication/MFA tests passed and Angular production build passed with existing budget/CommonJS warnings. Initial test invocation was corrected to use explicit include filters matching the isolated tsconfig; no broad-suite success is claimed. Backend/schema/security-policy/external-contract changes: none. No DB access, app startup, production changes, main merge or push.
- Reviewed the complete change: the runtime fix only supplies the missing router hook and compile-time interfaces. User should refresh localhost:4200 and retry login against the existing dev backend; no additional SQL or backend restart is required.

## Acceptance criteria

- Isolate per-source discovery/outcome writes and report every failed write.
- Prepare status schema alignment SQL. Subsequent explicit authorization permits only the documented dev schema application/removal; production execution remains prohibited.
- Table initialization reads stored state only. Explicit refresh verifies and persists consent/source metadata, preserving unverified state and permanent identities; no cache cleanup, transaction pull or billing effects.
- Direct cards reflect saved consent state. No verification timestamps/uncertainty states in the table.
- Report four operational stages, sanitized causes, source/user scope, partial outcomes and reconciled transaction counts. Hebrew support messages include stable codes and unique error IDs.
- Webhook receipt and processing outcomes are distinct; failed processing can be retried without replaying successful events concurrently.
- Never claim full success for failed persistence or silently excluded transactions; retain cached data during refresh and bound polling/retries.
- Focused mocked regression tests plus backend/frontend builds. No production access, business-data writes, remote push, dedicated recovery tool or main integration; only explicitly authorized dev DDL.

## Handoff

- Result: implemented locally, ready for review; no main integration or remote push.
- Commit: the local feature commit containing this handoff (reported to the user after commit).
- Changed areas: Feezback discovery/permission snapshots, per-source persistence and timestamp fencing, webhook processing leases, transaction accounting/outcome propagation, login dispatch, stored permission UI, support messages, polling and retained table rows. Adjacent AGENTS documentation matches the new behavior.
- Backend: **25 suites / 280 tests passed**, using mocked provider/database repositories. Command: `npm test -- --runInBand src/feezback src/transactions/user-sync-state.service.spec.ts src/users/users.controller.banking-start.spec.ts src/users/users.controller.demo-sync.spec.ts --silent`.
- Backend build: `npm run build` passed.
- Frontend: **63 tests passed** in ChromeHeadless. Command: `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.banking-reliability.spec.json --include=src/app/components/open-banking-management/*.spec.ts --include=src/app/components/generic-table/generic-table.component.spec.ts --include=src/app/components/generic-table/table-actions.spec.ts --include=src/app/services/sync-status.reliability.spec.ts`.
- Angular production build: `NG_BUILD_MAX_WORKERS=2 npm run build` passed; existing style/bundle budgets and CommonJS dependency warnings remain. Commands ran on Node 24; the frontend declares Node 20.
- Known pre-existing failure: the broader selected UI run had 68 passed / 1 failed. `table-action-consumers.spec.ts` calls `IncomesPage.confirmResumeAutomaticAllocation` on a prototype fixture without its confirmation service (`Cannot read properties of undefined (reading 'add')`). Reproduced on the exact recorded base frontend: 10 passed / 1 failed. Feature frontend files were backed up and restored around that baseline-only run in the owned worktree. No unrelated invoice code/test was changed.
- Schema: [standalone SQL](../../features/feezback-sync-reliability.sql), synchronized with the canonical final section in `docs/redesign/cutover.sql`. Initially prepared only; subsequently applied to the explicitly authorized `keepintax-dev` database as recorded below. No production application.
- Production: no production log/DB/provider access, application startup, synchronization or mutations during implementation.
- Security: existing owner/verified-admin/tenant boundaries retained. Structured support diagnostics omit credentials/full account identifiers. Local environment files remain ignored and uncommitted.
- Accounting: no rule/classification/calculation changes. Existing ingestion deduplication/classifications are preserved; accounting of ingestion outcomes now detects exclusions and inconsistencies instead of claiming complete success.
- External contract: new explicit `POST /feezback/refresh-permissions`; `GET /feezback/disconnection-targets` reads stored state only. Webhook receipt remains independently acknowledged. Supplier policy/consent-scope failures remain supplier issues; no supplier messages were sent.
- Risks/manual checks: SQL must be exercised on an isolated test database; live provider behavior has not been revalidated. Use the ordinary permission refresh followed by the existing explicit pull to restore missing links/transactions; no bespoke recovery tool. Check desktop/mobile retention, partial refresh preservation, stable Source IDs, webhook replay and copyable support IDs using [the acceptance checklist](../../features/feezback-sync-reliability.md).
- Verification evidence: command output kept outside the repository. Local primary checkout was observed clean on main at `88b6ad9da30d6413926c7ce6473a007f4ab896cf`; it advanced independently after this task's base was recorded. This task did not modify it. Integration must review against then-current main.

## Integration

- Not integrated, not pushed, not deployed. Only the later explicitly authorized dev schema application below was performed; no production application.
- Further GitHub pushing remains subject to Elazar's explicit manual testing of the current local main revision and renewed explicit push approval.

## Review follow-up

- Same feature worktree and branch, following the review of `587ad424`.
- Addressed all eight findings: fresh saving cancellation previews; preservation of aggregate failure after subset success; spouse selection from owned saved pointers; terminal-write error propagation/recovery; partial quality including existing/legitimate duplicate rows; valid-consent resumption; provider-independent saved reads; masked legacy diagnostics.
- Permanent reproductions: `backend/src/feezback/feezback-review-regression.spec.ts` and `frontend/src/app/components/open-banking-management/open-banking-review-regression.spec.ts`. Added negative/in-flight/error cases and adapted the existing preview/mock contracts.
- Follow-up review also closes false-success source outcomes/dialogs after rejected persistence, and conditionally interrupts a job whose connection disappears during its pull without reviving cleanup-cleared lifecycle state.
- Final repeated verification: **280 backend tests in 25 suites; 63 frontend tests; Nest build and Angular production build passed**. Existing Angular budget/CommonJS warnings remain. Reports remain outside Git; no source changes followed final verification.
- Re-review: checked the final diff against all eight findings, provider-only refresh boundaries, owner/role scope, no false success from rejected/previously cached rows, confirmation failure guards and lifecycle interruption/cleanup ordering. All original reproductions are permanent and green; no additional actionable finding remained in this local review. Live provider and transaction-processing behavior was not exercised. Later dev schema verification is recorded below.
- No schema changes beyond the prepared, unexecuted SQL section. No production access, app startup, main integration or remote push. This review follow-up is the local feature commit containing these changes; its hash is reported to the user.

## Authorized dev schema application — 2026-11-01

- User explicitly requested execution after the local testing instructions. Target was checked against this worktree's environment and hard-guarded to `keepintax-dev`, port 3306, on the documented shared MySQL host. Other database targets, including production, were rejected by the execution guard.
- MySQL: `8.0.37-google`. Preflight found only allowed status values. Existing status was `varchar(255)`; the four new columns were absent.
- Saved the four original CREATE TABLE definitions, preflight column metadata and status counts outside Git before applying the exact standalone section. SQL SHA-256: `be55f94a1b410c35c965951260c41c34a51bd8e9b14f94e5b8d847f71d6cc586`.
- Applied the standalone section on one connection with a migration advisory lock, bounded metadata-lock wait and strict SQL mode. No historical cutover execution, data backfill, provider calls or application startup.
- Verified `user_source_sync_state.status` is `varchar(32) NOT NULL DEFAULT 'not_synced'`; `source.metadataVerifiedAt`, `user_source_sync_state.consentVerifiedAt` and `feezback_webhook_events.processing_started_at` are nullable `datetime(3)`; `user_sync_state.permissionsSnapshot` is nullable `json`.
- Status counts unchanged: 9 `not_synced`, 2 `skipped_direct`, 15 `success`. No row DML was issued. Verification snapshot retained alongside the schema backup outside the repository.
- Production untouched. No merge to main, remote push, sync or live callback configuration change. The worktree can now use this dev schema for manual application testing.

## Explicit snapshot removal and scope review — 2026-11-01

- Same feature worktree; preserved the separately committed token-lifetime fix already in its history.
- Removed all runtime permissionsSnapshot/savePermissionsSnapshot usage. Stored source links/names are read directly from owned Source/user_source_sync_state rows. Current provider-only/pending permissions are returned by the saving refresh for confirmation, without another persisted permission list. Initial cached views cannot authorize cancellation or prove complete provider absence.
- Retained only two operational scalars (lastSourcesRefreshAttemptAt, sourcesRefreshFailureReason), for stale-result fencing and post-consent support errors. Existing consent-start/refresh-success timestamps gained millisecond precision. Disconnect verification advances the operational fence but preserves discovery freshness/cleanup semantics.
- Scope audit: removed duplicate data and its stale fallback path. Kept source/consent fences, webhook lease/replay, four-stage diagnostics, persistence accounting and cached-row/login improvements because each maps to an explicit requirement. No replacement permission table, repair job or expanded UI status/date model.
- Dev execution: explicitly approved keepintax-dev only, MySQL 8.0.37-google. Backed up user_sync_state definition and old JSON values outside Git; ran the pinned cleanup SQL (SHA-256 8d1e1af569516f55b768844120f763d0b9c6692ef7881975d545c4cda9a500b5). Verified the JSON column is absent, scalar definitions/precisions match entities, all 12 rows remain and existing timestamp values are unchanged. No row DML, app startup, production access, integration or push.
- Final verification: 308 backend tests in 27 suites and 67 frontend tests passed; Nest and Angular builds passed. Existing Angular budget/CommonJS/Node-version warnings remain. Reports are outside Git. The known unrelated invoice-action fixture failure remains documented in the earlier validation section.
- Re-review covered current stored-link reads, consent rotation/removal, source-less pending permissions, live-only cancellation confirmation, partial proof retention, stale-result locking, same-second error attribution and post-disconnect cleanup/freshness. Also fixed and tested disconnect-result DB failure returning an OB-02 support error instead of full success or an unclassified exception. No additional actionable issue identified within this change; no real provider/application end-to-end execution.
