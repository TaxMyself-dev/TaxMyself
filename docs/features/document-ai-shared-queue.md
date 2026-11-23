# Shared document analysis queue

Original implementation branch: `codex/document-ai-queue`, based on `de8369bc`.

The DEV measurements and schema/activation notes below record that earlier delivery. For the current two-task ceiling, operator-reported production schema completion and authenticated Cloud Scheduler activation, use the [Scheduler runbook](document-ai-scheduler.md).

## Ownership and admission

`DocumentAiWorker` is the sole document-provider caller. Gmail hands off through `queueEmailWork`; other INBOX intake (including Drive, WhatsApp and forwarded email) registers jobs during the existing discovery sweep. Manual uploads, transaction uploads and form autofill reserve durable jobs before uploading. Protected replacements rejoin their existing intake route. No agent runtime was changed.

The queue uses MySQL, not an external queue product. `document_processing_jobs` freezes owner, business, actor, source, purpose, SHA-256, provider, model and policy. Status requests require authentication, the existing delegation scope and the selected business. Raw provider responses are never included in polling responses.

Admission checks a shared capacity row inside a short transaction. Jobs are selected round-robin across owner/business pairs, with a 3:1 interactive/bulk preference and no idle capacity reservation. A single business can fill every available slot. The global configured concurrency applies across instances sharing the capacity key. No database connection is held during the provider request.

## Capacity configuration and measurement

The feature worktree has a conservative local DEV profile based on the controlled measurements below. All scheduled tasks remain disabled. Production configuration has not been set. The supported settings are:

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

Numeric settings are required positive integers. The current hard safety ceiling is two document tasks globally, including saved-result completion. Higher configured concurrency is rejected. Historical DEV measurements below are not the current activation profile. Missing/invalid configuration fails closed. Existing jobs keep their provider/model/policy; changing the active quota group does not migrate them.

The admission engine reserves separate request/input/output budgets and reconciles observed usage, including cache writes. Missing usage does not earn a refund. Successful response headers may reduce remaining budgets; confirmed 429 responses honor Retry-After. Text prompt size is estimated in addition to measured image/page cost. Estimates are conservative inputs, not exact token counting or a guarantee that the provider will never throttle.

Per-job `usage_json` and `timings_json` retain input/output/cache usage, wait/preparation/provider/completion duration and a process RSS/heap/CPU snapshot. Process measurements include concurrent work and must not be interpreted as the exclusive cost of one document. Start a separately authorized calibration with a small synthetic batch, compare estimates to observed usage, then increase concurrency while observing provider 429s, latency percentiles, process memory/CPU, MySQL pool usage and Drive latency. Set a safety margin from those measurements and the provider dashboard. The same normalized request/input/output dimensions support an OpenAI adapter; account/model quota semantics must be mapped by that adapter. The current OpenAI coverage is a fake adapter only.

## Lifecycle and recovery

`UPLOADING → READY → PREPARING → IN_FLIGHT → RESULT_SAVED → COMPLETING → COMPLETED`.

- Upload reservation precedes bytes; an operation tag and SHA-256 allow recovery without uploading again.
- Discovery and durable admission remain separate from completion. Existing restoration/dedup rules remain in discovery; compatible jobs can reuse a retained owned file/result.
- Legacy cron dispatch runs every 2 seconds and recovery every 30 seconds. In scheduler mode both wrappers are suppressed; authenticated request-bound rounds replace dispatch and expired-lease recovery, and a second authenticated maintenance endpoint replaces upload recovery and temporary cleanup. See [Scheduler runbook](document-ai-scheduler.md). In both modes, leases are 3 minutes with a 30-second heartbeat. An orphan upload is examined after 5 minutes.
- Expired preparation can resume before a provider attempt. Expired `IN_FLIGHT` becomes `UNKNOWN`; it is never automatically replayed or sent to another provider.
- A saved result resumes completion without AI. Completion claims and source handoff are fenced. A persistence marker prevents a Drive completion retry from overwriting later user edits.
- Known provider rejections are distinguished from ambiguous network/5xx outcomes. Confirmed rate limits may retry; technical failures never authorize deletion.
- PDF password requirements retain their dedicated path. Invalid/unreadable PDFs and oversized estimates remain blocked for attention.
- Gmail keeps its existing six-type classification, ordinary uncertain approval and explicit-negative deletion lifecycle. The Gmail file worker performs storage/persistence/deletion only; the shared worker performs AI. Other intake purposes do not inherit Gmail's deletion policy.
- Form autofill uses a private business `analysis-temporary` folder and a 24-hour expiry. It creates no archive/expense row. Closing the form stops polling, not the durable job. Expired temporary files require matching operation tag, owned folder, hash and no references before deletion. Unconfirmed deletion retries, at most five attempts before attention; shared/original files are retained. Stored results are purged on cleanup. Controlled synthetic live verification confirmed temporary-file deletion and reference protection; no general cleanup worker was enabled.
- Transaction completion locks and rechecks the document and transaction together. Another link, a deleted document or intervening approval prevents a new link.
- Existing staging is retained during transition. Do not remove it until existing workers/jobs have been audited and a separately approved cutover has completed.

## API and interface

Upload/OCR endpoints return `{queued:true, jobId, state, driveFileId, filename}`. `GET /documents/me/analysis/:jobId?businessNumber=…` returns scoped state and terminal completion data. Frontend services poll without overlapping requests and stop after a terminal result/unsubscription. Manual autofill ignores results for an obsolete file/business and preserves edited fields. Transaction UI ignores a result for a business that is no longer selected.

## DEV state and activation boundary — 2026-11-22

The two queue tables from `document-ai-queue.sql` were applied to DEV under separate authorization and tested with synthetic records. The same schema block is retained in `docs/redesign/cutover.sql`; do not execute that historic cumulative script. No production schema was changed. Existing DEV jobs are out of scope for migration, as confirmed by Elazar. Production is expected to have no legacy jobs; verify that expectation before activation rather than silently replaying unknown in-flight work.

Current local DEV settings exist only in this feature worktree's ignored `backend/.env`:

| Setting | DEV value | Basis |
| --- | --- | --- |
| Provider / model | `anthropic` / `claude-sonnet-4-6` | Provider used in the live sample |
| Limit group | `dev-anthropic-sonnet-4-6` | Stable DEV quota-pool identity; all replicas sharing this provider pool must share it |
| Maximum concurrency (historical; now capped at 2) | 4 | Four live jobs completed in 14.828 seconds; observed provider overlap peaked at three. This is a tested starting ceiling, not a saturation benchmark |
| RPM | 60 | Conservative application budget versus observed provider quota 5,000 RPM; about four calls per four seconds of measured mean provider time before overhead |
| Input tokens/minute | 200,000 | Four percent of observed 5,000,000 input quota, allowing margin over the small-file sample |
| Output tokens/minute | 100,000 | Ten percent of observed 1,000,000 output quota |
| PDF page / image estimate | 5,000 / 5,000 | Conservative initial reservations; large scans and images were not calibrated by the single-page sample |
| Output estimate | 8,192 | Matches the processor's `max_tokens`, rather than assuming the small observed average will hold |

Reservations are reconciled with usage. Token budgets can constrain throughput before the concurrency ceiling. The initial estimates are not exact token counts; provider responses and representative larger-document measurements must guide subsequent changes. Other provider clients sharing the account also consume quota; separate environment keys do not create separate provider quotas. OpenAI requires a real adapter and its own measured profile; fake-adapter tests do not provide a live integration.

`DISABLE_SCHEDULED_TASKS=true` remains set locally, disabling Nest cron jobs, intervals and timeouts, including AI dispatch and deletion workers. No app or provider is started by saving settings. This is not a blanket block on HTTP-triggered work: do not call import, processing or deletion endpoints without authorization. No server was started during merge preparation. No schema or existing job was changed. Feature ports remain 4204/3004 through ignored configuration; tracked defaults stay 4200/3000. Main environment files were not changed or copied.

To activate a later authorized DEV test, first review pending jobs and start only the agreed scope. No legacy-job backfill is required for this delivery. Do not change inline processing back on for content already queued; saved results and unknown outcomes remain durable. Existing staging stays in place. Production activation requires separately approved schema/configuration and an audit that no old dispatcher is active.

The scheduler needs a process with CPU time. Before future Cloud Run activation, verify always-on/min-instance/CPU allocation policy. Persistence prevents lost work while stopped, but does not run cron on a suspended instance. No deployment policy was changed.

## Verification

The controlled live report is `document-ai-live-verification-2026-11-22.md`. It records real MySQL contention, provider/Drive operations on synthetic fixtures, exact scope and limits, and authenticated browser verification through 4204. The active task records offline checks after current main was merged into the feature branch. No new live operations were used for merge preparation. Representative 300-document throughput, deployment sizing and live financial transaction linking remain unmeasured; they are not claimed by the synthetic tests.
