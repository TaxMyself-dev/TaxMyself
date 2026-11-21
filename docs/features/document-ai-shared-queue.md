# Shared document analysis queue

Implementation branch: `codex/document-ai-queue`, based on `de8369bc`.

## Ownership and admission

`DocumentAiWorker` is the sole document-provider caller. Gmail hands off through `queueEmailWork`; other INBOX intake (including Drive, WhatsApp and forwarded email) registers jobs during the existing discovery sweep. Manual uploads, transaction uploads and form autofill reserve durable jobs before uploading. Protected replacements rejoin their existing intake route. No agent runtime was changed.

The queue uses MySQL, not an external queue product. `document_processing_jobs` freezes owner, business, actor, source, purpose, SHA-256, provider, model and policy. Status requests require authentication, the existing delegation scope and the selected business. Raw provider responses are never included in polling responses.

Admission checks a shared capacity row inside a short transaction. Jobs are selected round-robin across owner/business pairs, with a 3:1 interactive/bulk preference and no idle capacity reservation. A single business can fill every available slot. The global configured concurrency applies across instances sharing the capacity key. No database connection is held during the provider request.

## Capacity configuration and measurement

No actual quota values have been invented or enabled in DEV. Before activation, provide reviewed values in the backend's ignored environment file:

| Variable | Meaning / source |
| --- | --- |
| `DOCUMENT_AI_PROVIDER` | `anthropic` currently; a future provider needs its adapter |
| `DOCUMENT_AI_MODEL` | Exact supported model to freeze on new jobs |
| `DOCUMENT_AI_LIMIT_GROUP` | Stable key for the actual provider/account/model quota pool, shared by every replica using that pool |
| `DOCUMENT_AI_MAX_CONCURRENCY` | Server-safe measured concurrent document tasks, not a per-business limit |
| `DOCUMENT_AI_RPM` | Reviewed requests/minute budget below the account's effective quota |
| `DOCUMENT_AI_ITPM` | Reviewed input tokens/minute budget |
| `DOCUMENT_AI_OTPM` | Reviewed output tokens/minute budget |
| `DOCUMENT_AI_PDF_PAGE_TOKENS` | Conservative measured input estimate per PDF page for this model |
| `DOCUMENT_AI_IMAGE_TOKENS` | Conservative measured image input estimate |
| `DOCUMENT_AI_OUTPUT_ESTIMATE` | Conservative measured output reservation per request |

Numeric settings are required positive integers. Concurrency above 64 requires a separate implementation review; 64 is an implementation guard, not an assertion about provider quota or measured server throughput. Missing/invalid configuration fails closed. Existing jobs keep their provider/model/policy; changing the active quota group does not migrate them.

The admission engine reserves separate request/input/output budgets and reconciles observed usage, including cache writes. Missing usage does not earn a refund. Successful response headers may reduce remaining budgets; confirmed 429 responses honor Retry-After. Text prompt size is estimated in addition to measured image/page cost. Estimates are conservative inputs, not exact token counting or a guarantee that the provider will never throttle.

Per-job `usage_json` and `timings_json` retain input/output/cache usage, wait/preparation/provider/completion duration and a process RSS/heap/CPU snapshot. Process measurements include concurrent work and must not be interpreted as the exclusive cost of one document. Start a separately authorized calibration with a small synthetic batch, compare estimates to observed usage, then increase concurrency while observing provider 429s, latency percentiles, process memory/CPU, MySQL pool usage and Drive latency. Set a safety margin from those measurements and the provider dashboard. The same normalized request/input/output dimensions support an OpenAI adapter; account/model quota semantics must be mapped by that adapter. The current OpenAI coverage is a fake adapter only.

## Lifecycle and recovery

`UPLOADING → READY → PREPARING → IN_FLIGHT → RESULT_SAVED → COMPLETING → COMPLETED`.

- Upload reservation precedes bytes; an operation tag and SHA-256 allow recovery without uploading again.
- Discovery and durable admission remain separate from completion. Existing restoration/dedup rules remain in discovery; compatible jobs can reuse a retained owned file/result.
- Dispatch runs every 2 seconds. Recovery runs every 30 seconds; leases are 3 minutes with a 30-second heartbeat. An orphan upload is examined after 5 minutes.
- Expired preparation can resume before a provider attempt. Expired `IN_FLIGHT` becomes `UNKNOWN`; it is never automatically replayed or sent to another provider.
- A saved result resumes completion without AI. Completion claims and source handoff are fenced. A persistence marker prevents a Drive completion retry from overwriting later user edits.
- Known provider rejections are distinguished from ambiguous network/5xx outcomes. Confirmed rate limits may retry; technical failures never authorize deletion.
- PDF password requirements retain their dedicated path. Invalid/unreadable PDFs and oversized estimates remain blocked for attention.
- Gmail keeps its existing six-type classification, ordinary uncertain approval and explicit-negative deletion lifecycle. The Gmail file worker performs storage/persistence/deletion only; the shared worker performs AI. Other intake purposes do not inherit Gmail's deletion policy.
- Form autofill uses a private business `analysis-temporary` folder and a 24-hour expiry. It creates no archive/expense row. Closing the form stops polling, not the durable job. Expired temporary files require matching operation tag, owned folder, hash and no references before deletion. Unconfirmed deletion retries, at most five attempts before attention; shared/original files are retained. Stored results are purged on cleanup. This cleanup code has only been tested with mocks and has not executed against Drive.
- Transaction completion locks and rechecks the document and transaction together. Another link, a deleted document or intervening approval prevents a new link.
- Existing staging is retained during transition. Do not remove it until existing workers/jobs have been audited and a separately approved cutover has completed.

## API and interface

Upload/OCR endpoints return `{queued:true, jobId, state, driveFileId, filename}`. `GET /documents/me/analysis/:jobId?businessNumber=…` returns scoped state and terminal completion data. Frontend services poll without overlapping requests and stop after a terminal result/unsubscription. Manual autofill ignores results for an obsolete file/business and preserves edited fields. Transaction UI ignores a result for a business that is no longer selected.

## Prepared schema and activation boundary

`document-ai-queue.sql` contains two new tables only. The same prepared block is included in `docs/redesign/cutover.sql`. Neither has been applied. No TypeORM synchronization or startup migration creates these tables.

Before any future DEV activation, separately authorize schema application, fill measured quota settings, audit old `AI_IN_FLIGHT`/claims and existing pending jobs, and agree which synthetic batch may execute. Do not automatically transfer old jobs. Stop old dispatch before an approved backfill, retain origin IDs/history and reconcile counts before starting shared admission. Rollback requires stopping dispatch first; unknown paid outcomes and saved results must remain durable. Do not switch old inline AI back on for queued content.

No server was started for this implementation. No live schema, user data, AI request, document deletion, main integration, push or deployment was performed. The existing launcher reads ignored `.local-ai-dev/ports.json`: feature frontend 4204, backend 3004 and API `http://127.0.0.1:3004/`. The backend's ignored env uses port 3004 and frontend return URL 4204. Configuration was verified with `node frontend/scripts/start-local.js --print-config` only. Tracked main defaults remain 4200/3000.

The scheduler needs a running process with CPU time. In a future Cloud Run activation, verify the existing always-on/min-instance/CPU allocation policy before expecting autonomous background progress. Persistence prevents lost work while no worker runs; it does not cause a suspended instance to execute cron jobs. No deployment configuration was changed here.

## Verification limits

Mock tests prove scheduling decisions, source contracts, lease-fencing/error paths, UI polling and guarded completion. They do not prove MySQL engine behavior under real replica contention, actual provider throughput, Drive permissions or end-to-end application behavior. Those require the separately authorized DEV phase. Build/test commands and exact outcomes are recorded in the task file.
