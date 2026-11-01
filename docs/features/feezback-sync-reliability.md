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

The prepared [standalone SQL section](feezback-sync-reliability.sql) is also appended to [the canonical cutover file](../redesign/cutover.sql). It widens `user_source_sync_state.status` to `varchar(32)` for `skipped_direct`, adds per-source verification fences, a saved permission snapshot, and a webhook processing-lease timestamp. The new columns are nullable; column additions check `information_schema` before execution.

1. Review the SQL and verify the preflight query returns no unexpected status values. Use the normal schema backup procedure.
2. Apply only this additive section to an isolated test database, then before deploying the matching backend. Do not run the entire historical cutover file. The new backend requires these columns.
3. Deploy the backend and frontend together after verification. Confirm production schema synchronization remains disabled.
4. Use the normal **רענון בדיקת הרשאות** action to repair confirmed missing/stale links, followed by the existing explicit transaction-pull flow. Refresh alone deliberately does not restore missing transactions. Existing deduplication and classifications remain in effect. No user-specific recovery script is included.
5. Observe partial failures and supplier errors; a local fix cannot resolve provider policy denial or missing provider consent scope.

Implementation used mocked tests/local builds without app startup, production access or push. Following the user's subsequent explicit request, the standalone SQL was applied and verified on `keepintax-dev` (MySQL `8.0.37-google`) on 2026-11-01, after schema backup and preflight; status counts were unchanged. This does not constitute provider/application end-to-end validation or a production schema application. For code rollback, retain the additive nullable columns/wider status type; do not narrow the status column while `skipped_direct` rows exist.

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
