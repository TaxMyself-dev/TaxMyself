# Feezback consent and ingestion reliability

## Result

Settings reads saved consent state only. Webhooks and the explicit permission-refresh action reconcile verified provider metadata into stable local sources. Refresh does not pull transactions, revoke consent, clear transaction caches, or enroll/change billing. Direct-card text follows the saved consent pointer rather than hiding missing consent.

Discovery and outcome writes continue after an individual source fails, then report an aggregate failure. Negative reconciliation requires a complete, verified scope. Partial/unavailable scopes keep their previous pointers; unknown consent states protect existing links. Timestamp comparisons and the user-row lock prevent an older completed refresh from replacing newer saved metadata. Existing source IDs, bill assignments and transaction classifications are preserved.

Webhook receipt is separate from successful processing. Failed or abandoned processing can be claimed again; successful and currently claimed duplicates do not repeat processing. A ten-minute lease bounds abandoned claims. This is receipt deduplication, not an automatic recovery scheduler.

Transaction outcomes account separately for newly cached rows, previously cached rows, provider duplicates and rejected/unaccounted rows. Matching an existing expense still writes a cache row, so it is informational rather than a second removed duplicate. Any persistence failure/count mismatch prevents full success. One malformed card cannot discard other cards. Login dispatches banking synchronization before awaiting Drive diagnostics; cached rows remain visible while a real job runs or fails. Poll requests complete before another is sent, have a 15-second timeout, and stop after 200 timer attempts. Automatic retry does not repeatedly retry authorization/local persistence failures within the same run.

## Errors

| Code | Logged stage |
| --- | --- |
| OB-01 | `consent_check` |
| OB-02 | `connection_save` |
| OB-03 | `transaction_fetch` |
| OB-04 | `transaction_save` |

Handled server failures return a unique error ID matching sanitized server diagnostics. The Hebrew support component shows the message, code and **מזהה שגיאה**, and copies those details. Network/client failures that never return a server diagnostic receive a client error ID recorded in the browser console. Do not expect a corresponding server record for a request that never reached it.

Diagnostics include the user, stable source ID/role where known, masked payment identifier, allowlisted provider/database cause and relevant counts. They omit credentials, raw exception/config objects, raw SQL and full account identifiers.

## Schema and rollout order

The [current schema SQL](feezback-sync-reliability.sql) uses varchar(32) for skipped_direct, per-source timestamp fences and a webhook lease. The [upgrade removing duplicate permission storage](feezback-remove-snapshot.sql) adds only scalar attempt-time/support-error fields, aligns existing flow timestamps to milliseconds and drops the former JSON column. That upgrade is appended to [the canonical cutover file](../redesign/cutover.sql); column changes check information_schema. All new operational fields are nullable.

1. Review the SQL and verify the preflight query returns no unexpected status values. Use the normal schema backup procedure.
2. Apply only the appropriate reviewed section to the approved test database, before starting the matching backend. Back up the old JSON column before its removal. Do not run the entire historical cutover file. The new backend requires the operational scalar fields.
3. Deploy the backend and frontend together after verification. Confirm production schema synchronization remains disabled.
4. Use the normal **רענון בדיקת הרשאות** action to repair confirmed missing/stale links, followed by the existing explicit transaction-pull flow. Refresh alone deliberately does not restore missing transactions. Existing deduplication and classifications remain in effect. No user-specific recovery script is included.
5. Observe partial failures and supplier errors; a local fix cannot resolve provider policy denial or missing provider consent scope.

Implementation used mocked tests/local builds without app startup, production access or push. Following the user's subsequent explicit request, the standalone SQL was applied and verified on `keepintax-dev` (MySQL `8.0.37-google`) on 2026-11-01, after schema backup and preflight; status counts were unchanged. This does not constitute provider/application end-to-end validation or a production schema application. The later approved removal of the old JSON column is recorded below. Do not roll back to code requiring that removed column. Retain the wider status type while skipped_direct rows exist.

## Manual acceptance checks

- Opening settings sends only stored reads. Existing rows remain after a failed read.
- Permission refresh repairs confirmed pointers without changing Source IDs/bills, pulling transactions or modifying billing/cache state. A provider timeout/partial response leaves unverified pointers untouched.
- Direct cards without saved consent show **ללא הרשאה**; connected direct cards show **נמשך דרך חשבון הבנק**. No verification date or uncertainty status is added to the table.
- A failed source write does not prevent later sources. The result is partial/failed, with a matching error ID and copyable Hebrew support message.
- A failed webhook remains unprocessed with an error. Replaying it recovers after the cause is fixed; replaying a successful/currently claimed event does not process it again.
- A missing source/consent link, normalization failure or DB write failure prevents full transaction success. Count summaries explain the difference. Existing cached rows remain on both desktop and mobile.
- Sign-in does not wait for Drive diagnostics before dispatching banking sync. No active transaction job means no fabricated `running` state; stale polling eventually ends with a support error.

Automated verification and the known base-test failure are recorded in [the task handoff](../tasks/active/feezback-sync-reliability.md). Local main integration, manual testing on main, production application and remote push are outside this task's authorization.

## Review follow-up

- Cancellation dialogs refresh and save the affected-instrument list before opening confirmation. Partial/failed/in-flight checks block confirmation; initial screen reads remain local.
- Successful subset pulls preserve prior aggregate quality/error/counts. A full sync can certify recovery. Partial quality includes existing rows and legitimate duplicates, even with zero new inserts.
- Normal identity selection includes saved, owned spouse consent/resource links when the historical identity flag is absent. Incomplete pointers do not qualify; read errors propagate. No identity flag or billing activation is inferred from the browser return.
- Terminal-state write exceptions reach bounded failure recovery for both full pulls and login retries. If authorization disappears mid-pull, a conditional running-only interruption ends the old job without overwriting lifecycle state cleared by explicit disconnect cleanup.
- Returning consent status to valid revalidates saved metadata using both identities, without triggering a transaction pull. Failed processing retains normal webhook replay eligibility.
- Stored management reads bypass the provider queue. Console source summaries are masked and settings logs only source counts. Structured errors retain sanitized causes and support IDs.
- Known rejected source IDs receive failed outcomes rather than provider-read success. The dashboard terminal dialog honors aggregate support errors even if all returned source reads succeeded or no source rows are available.

These cases are permanent mocked regressions in the backend and banking UI suites. The SQL artifact is unchanged; its later authorized dev-only execution is recorded above and in the task handoff. Production/provider verification remains outstanding.

## Removal of duplicate permission storage

The initial JSON copy was unnecessary and introduced a second representation of source links/names. It has been removed from the entity, reads, writes and refresh/disconnect paths. Initial views derive from Source and user_source_sync_state. A successful refresh first saves verified links and returns the current provider permission list for confirmation, including pending permissions without sources; that response is not stored as another list. Empty cached links therefore never disable full cancellation before a live check.

Only lastSourcesRefreshAttemptAt and sourcesRefreshFailureReason remain as new operational metadata: the observation fence prevents older results from changing the current connection flag, and the support token enables immediate post-consent error reporting. They contain no permissions, source IDs, mappings or names. The existing lastConsentInitiatedAt/lastSourcesRefreshAt timestamps are now precise to milliseconds to distinguish attempts within the same second. Disconnect verification updates the fence without stamping discovery freshness.

The upgrade was explicitly authorized and applied only to keepintax-dev after private schema/old-column backup. The old JSON column is absent; all 12 user_sync_state rows and existing timestamp values were preserved. No application was started and no production/provider callback, merge or push occurred. Backup/verification evidence is outside Git.

The relevance review retained per-source fences, the webhook processing lease, isolated persistence outcomes, cached-row rendering and independent login dispatch because each addresses an agreed failure or latency requirement. It removed the redundant permission-list representation and avoided a replacement consent table, repair job or UI verification-date/status mechanism. Live provider and full application behavior still require manual testing.
