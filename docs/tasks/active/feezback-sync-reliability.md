# Feezback consent and ingestion reliability

- Status: `WORKER_COMPLETE`
- Task manager / implementer: Codex, this task; no delegated workers.
- Worktree: TaxMyself-feezback-sync-reliability
- Branch: codex/feezback-sync-reliability
- Base commit: ecdc1455a30e921a8c89189b549dd3a641c8956d

## Acceptance criteria

- Isolate per-source discovery/outcome writes and report every failed write.
- Prepare status schema alignment SQL; do not execute it against any database.
- Table initialization reads stored state only. Explicit refresh verifies and persists consent/source metadata, preserving unverified state and permanent identities; no cache cleanup, transaction pull or billing effects.
- Direct cards reflect saved consent state. No verification timestamps/uncertainty states in the table.
- Report four operational stages, sanitized causes, source/user scope, partial outcomes and reconciled transaction counts. Hebrew support messages include stable codes and unique error IDs.
- Webhook receipt and processing outcomes are distinct; failed processing can be retried without replaying successful events concurrently.
- Never claim full success for failed persistence or silently excluded transactions; retain cached data during refresh and bound polling/retries.
- Focused mocked regression tests plus backend/frontend builds. No production access, data change, remote push, dedicated recovery tool or main integration.

## Handoff

- Result: implemented locally, ready for review; no main integration or remote push.
- Commit: the local feature commit containing this handoff (reported to the user after commit).
- Changed areas: Feezback discovery/permission snapshots, per-source persistence and timestamp fencing, webhook processing leases, transaction accounting/outcome propagation, login dispatch, stored permission UI, support messages, polling and retained table rows. Adjacent AGENTS documentation matches the new behavior.
- Backend: **25 suites / 280 tests passed**, using mocked provider/database repositories. Command: `npm test -- --runInBand src/feezback src/transactions/user-sync-state.service.spec.ts src/users/users.controller.banking-start.spec.ts src/users/users.controller.demo-sync.spec.ts --silent`.
- Backend build: `npm run build` passed.
- Frontend: **63 tests passed** in ChromeHeadless. Command: `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.banking-reliability.spec.json --include=src/app/components/open-banking-management/*.spec.ts --include=src/app/components/generic-table/generic-table.component.spec.ts --include=src/app/components/generic-table/table-actions.spec.ts --include=src/app/services/sync-status.reliability.spec.ts`.
- Angular production build: `NG_BUILD_MAX_WORKERS=2 npm run build` passed; existing style/bundle budgets and CommonJS dependency warnings remain. Commands ran on Node 24; the frontend declares Node 20.
- Known pre-existing failure: the broader selected UI run had 68 passed / 1 failed. `table-action-consumers.spec.ts` calls `IncomesPage.confirmResumeAutomaticAllocation` on a prototype fixture without its confirmation service (`Cannot read properties of undefined (reading 'add')`). Reproduced on the exact recorded base frontend: 10 passed / 1 failed. Feature frontend files were backed up and restored around that baseline-only run in the owned worktree. No unrelated invoice code/test was changed.
- Schema: prepared [standalone additive SQL](../../features/feezback-sync-reliability.sql), synchronized with the canonical final section in `docs/redesign/cutover.sql`; **not executed**, including against a local MySQL database. Apply/test the schema before starting the new backend.
- Production: no production log/DB/provider access, application startup, synchronization or mutations during implementation.
- Security: existing owner/verified-admin/tenant boundaries retained. Structured support diagnostics omit credentials/full account identifiers. Local environment files remain ignored and uncommitted.
- Accounting: no rule/classification/calculation changes. Existing ingestion deduplication/classifications are preserved; accounting of ingestion outcomes now detects exclusions and inconsistencies instead of claiming complete success.
- External contract: new explicit `POST /feezback/refresh-permissions`; `GET /feezback/disconnection-targets` reads stored state only. Webhook receipt remains independently acknowledged. Supplier policy/consent-scope failures remain supplier issues; no supplier messages were sent.
- Risks/manual checks: SQL must be exercised on an isolated test database; live provider behavior has not been revalidated. Use the ordinary permission refresh followed by the existing explicit pull to restore missing links/transactions; no bespoke recovery tool. Check desktop/mobile retention, partial refresh preservation, stable Source IDs, webhook replay and copyable support IDs using [the acceptance checklist](../../features/feezback-sync-reliability.md).
- Verification evidence: command output kept outside the repository. Local primary checkout was observed clean on main at `88b6ad9da30d6413926c7ce6473a007f4ab896cf`; it advanced independently after this task's base was recorded. This task did not modify it. Integration must review against then-current main.

## Integration

- Not integrated, not pushed, not deployed. No schema application authorized/performed.
- Further GitHub pushing remains subject to Elazar's explicit manual testing of the current local main revision and renewed explicit push approval.

## Review follow-up

- Same feature worktree and branch, following the review of `587ad424`.
- Addressed all eight findings: fresh saving cancellation previews; preservation of aggregate failure after subset success; spouse selection from owned saved pointers; terminal-write error propagation/recovery; partial quality including existing/legitimate duplicate rows; valid-consent resumption; provider-independent saved reads; masked legacy diagnostics.
- Permanent reproductions: `backend/src/feezback/feezback-review-regression.spec.ts` and `frontend/src/app/components/open-banking-management/open-banking-review-regression.spec.ts`. Added negative/in-flight/error cases and adapted the existing preview/mock contracts.
- Follow-up review also closes false-success source outcomes/dialogs after rejected persistence, and conditionally interrupts a job whose connection disappears during its pull without reviving cleanup-cleared lifecycle state.
- Final repeated verification: **280 backend tests in 25 suites; 63 frontend tests; Nest build and Angular production build passed**. Existing Angular budget/CommonJS warnings remain. Reports remain outside Git; no source changes followed final verification.
- Re-review: checked the final diff against all eight findings, provider-only refresh boundaries, owner/role scope, no false success from rejected/previously cached rows, confirmation failure guards and lifecycle interruption/cleanup ordering. All original reproductions are permanent and green; no additional actionable finding remained in this local review. Actual MySQL/provider behavior was not exercised.
- No schema changes beyond the prepared, unexecuted SQL section. No production access, app startup, main integration or remote push. This review follow-up is the local feature commit containing these changes; its hash is reported to the user.
