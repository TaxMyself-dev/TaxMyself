# Shared document AI queue — controlled DEV verification, 2026-11-22

Executable revision: `2bfa9764` (backend `10e9b249`). Authorization and DEV schema record: `b42b9bbb`. No executable repository changes were necessary during this verification.

Elazar explicitly authorized real AI and Drive deletion **only for newly generated synthetic files in DEV**. The test target was business נגרות, internal ID 5, on `keepintax-dev`. No production database, mailbox read/search, main integration, push or deploy was used.

## Execution boundary

The harness instantiated the production queue store/worker, document processor, Anthropic adapter, document source executor, catalog reader, Gmail attachment storage/file worker and protected-PDF services directly. It did not bootstrap the full Nest application or start any cron worker. Existing Drive provisioning/sharing was replaced with a read-only assertion of already provisioned DEV folders, so unrelated businesses and permissions were not reprovisioned. The actual 82-entry business catalog was used.

Uploads, content reads, moves and deletions were guarded by the generated fixture hashes and the manifest's newly created file IDs. Admission used a unique QA capacity group. Completion/recovery selectors were restricted to that group. A business advisory lock excluded concurrent general INBOX/Gmail workers while source operations ran. Only individually selected synthetic imports and replacement operations were delivered/reconciled; no general sweep ran.

All existing document/work records were outside the selected test IDs. New synthetic records and retained fixtures remain in DEV for inspection, identified by prefix `KTX-QA-20261122-6ea2888e`. Runtime profiles, manifest and assets are ignored local artifacts; credentials were never printed or committed.

## Observed results

| Check | Result |
| --- | --- |
| Manual PDF intake | Real upload, durable job, AI extraction, persistence and processed-folder completion passed |
| Manual duplicate | Same bytes returned the existing job; no second file or AI request |
| Saved-result continuation | A deliberate completion failure resumed from the saved result without another provider call |
| Form reuse | Reused the manual result without another AI call or archive/expense creation |
| Gmail attachment path | Production attachment storage → scoped shared admission → real AI → existing file lifecycle passed; no mailbox was searched/read |
| Six relevant types | Invoice, receipt, tax invoice/receipt, insurance policy, license fee and credit invoice each matched the expected type and reached pending review |
| Uncertain document | Partial invoice produced an actual `UNCERTAIN` decision; retained as ordinary `pending_review` with unknown document type |
| Explicit negative | Artificial picnic invitation produced `NOT_ACCOUNTING`; Drive deletion acknowledged and later 404 verified |
| Locked PDF | Actual password-protected PDF was detected as password required; no provider call for locked bytes |
| Invalid PDF | Artificial malformed PDF became `BLOCKED/INVALID_PDF`; the process continued and later files completed |
| Open replacement | Original retained with its original hash; open copy processed, replacement reconciled as `SUCCEEDED`, one extracted row for the copy |
| Replacement idempotency | Repeating the same operation key returned the existing operation without another file |
| Ownership | Foreign-owner replacement rejected; real status service rejected a foreign user and a different owned business |
| Temporary form file | Separate form-fill result created no archive row; expiry cleanup acknowledged deletion and purged its file pointer/result |
| Referenced-file deletion | A second synthetic queue reference blocked deletion of a confirmed-negative file; file remained present |
| Delete retry | After releasing only that synthetic reference, the existing confirmed-negative lifecycle deleted the file; reference history retained |
| Negative tombstone | Reimport of the deleted synthetic content was recognized as duplicate and did not recreate the file |
| Concurrent work | Four real document jobs completed in 14.828 seconds, with an observed peak of three overlapping provider calls; configured cap was four |
| Distributed admission | Two independent OS processes contending against MySQL admitted exactly one job at concurrency one |
| Preparation recovery | Expired synthetic preparation became READY and could be reclaimed |
| Unknown external boundary | A synthetic admitted-but-not-sent simulation became UNKNOWN after lease expiry, without any provider call/replay |
| Rate admission and UTC | A real MySQL RPM reservation deferred the second job for 59 seconds, then it became eligible and its budget replenished; no provider calls for this simulation |
| Accounting | Zero expense rows created automatically |

Final read-only audit verified **18 created files**: **15 retained with matching hashes**, **3 acknowledged deletions also confirmed absent**. The deleted files were the two explicitly non-accounting controls and the temporary form-fill file. The locked original was retained.

All **24 selected jobs** were terminal: 17 COMPLETED, 5 BLOCKED, 1 PASSWORD_REQUIRED and 1 UNKNOWN. The non-completed states are expected controls: the invalid/locked fixtures and explicitly labeled admission/reference simulations. The UNKNOWN simulation did not send an AI request. No actual AI request ended with an unknown outcome. No selected job remained UPLOADING, READY, PREPARING, IN_FLIGHT, RESULT_SAVED or COMPLETING.

## Provider and measurement evidence

Exactly **16 real provider requests** were made, using `claude-sonnet-4-6`. There were 16 persisted usage samples:

| Measurement | Observed |
| --- | ---: |
| Uncached input tokens | 28,155 |
| Cache-read input tokens | 64,248 |
| Cache-write input tokens | 14,663 |
| Output tokens | 2,584 |
| Mean provider duration | 4.045 seconds |

Successful provider response headers reported RPM 5,000, ITPM 5,000,000 and OTPM 1,000,000. These are observed service quota numbers, **not configured application concurrency or a guarantee of available capacity**. Other activity, workspace/spend limits and future quota changes still matter.

The live harness used conservative ephemeral limits, initially serial and then up to four active document jobs. Those values were never written to `backend/.env`. No permanent capacity profile or general worker activation was enabled. Starting DEV calibration at up to four tasks is supported by this small local batch; higher concurrency and deployment sizing require representative documents and measurements on the actual target server. No hard business-specific cap is required.

These were small English single-page synthetic PDFs. The sample does not establish throughput for 300 real documents, scanned/multi-page/image inputs, server memory ceilings, provider throttling under heavy load or deployment performance. The four-job figure is measured on this local machine and is not a production SLA.

## Commands and retained evidence

Temporary local helpers were invoked with one fixed run ID; they are **not production entrypoints or instructions to rerun paid work**:

```text
KTX_QA_RUN_ID=6ea2888e-09dc-44fc-a823-e742b54da755
node shared-queue-live-qa.cjs --preflight
node shared-queue-live-qa.cjs --live
node shared-queue-live-qa.cjs --extended
node shared-queue-native-utc.cjs
node shared-queue-live-qa.cjs --reference-test
node shared-queue-live-qa.cjs --audit
```

Each final execution exited 0. Local evidence includes `manifest.json`, `utc-retry-result.json`, synthetic assets and the live/core/extended/reference/audit logs. They remain outside tracked application files.

The harness initially had a read-result destructuring error, fixed before live document writes. Its initial connection omitted the application's existing `timezone: 'Z'`; scheduling-clock evidence was therefore collected separately using the correct UTC setting and a full real 59-second eligibility wait. Classification outcomes and provider-duration measurements did not depend on the omitted timezone. No application timezone change was needed.

The previously passing **214 backend tests / 33 suites**, **7 headless UI tests**, Nest build and Angular production build still apply to the unchanged executable revision. They were not rerun just to duplicate unchanged evidence. The UI tests used mocked HTTP; this run did **not** perform a logged-in live browser flow through 4204 or test normal full-application startup/authentication. No live bank transaction was created or modified; positive transaction linking retains its mocked coverage rather than claiming a new live financial-data test.

## Final state

No frontend/backend server was left listening on 4204/3004, and no automatic worker was started. General AI/deletion remain unactivated; only the controlled helper performed the authorized synthetic operations. Existing jobs were not transferred. No application source, accounting rules, main branch or production state changed.
