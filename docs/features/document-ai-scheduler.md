# Document AI Cloud Scheduler rounds

Implementation date: 2026-11-22. Base: local main
`5d405a014aded6995c4c4bf987af894f275eada8`, explicitly selected by Elazar.
Remote main was independently checked at `82446400227ee6e5ed8751eafc2eab1656c4161c`;
the histories diverge and that remote revision lacks the shared queue and agent.
No integration between those histories is part of this change.

## Behavior and limits

`POST /internal/document-ai/round` verifies a Google-signed OIDC token and runs
one wave of **at most two** jobs. It waits for preparation, AI, persistence,
completion and outstanding lease heartbeats before returning. It never fills
freed slots repeatedly. Empty/not-yet-due queues do no AI or Drive work.
Recovery still performs bounded DB statements on an empty queue.

Set `DOCUMENT_AI_DISPATCH_MODE=scheduler` on every serving revision. This turns
off only the document dispatch and document recovery cron wrappers. The endpoint
is closed in legacy/default `cron` mode. Invalid scheduler configuration fails
startup. Other cron/interval registrations are unchanged.

Both new-job and saved-completion claims acquire the same short global admission
transaction lock. A count across all quota groups includes leased PREPARING,
IN_FLIGHT, RESULT_SAVED and COMPLETING jobs. The hard ceiling is two document
tasks, including completions, across replicas running this implementation.
Per-provider token/request reservations, tenant/lane fairness, content reuse,
ownership, fenced writes and idempotent completion remain in the existing store.
Completion cannot take a saved result still leased by the original worker.
A 200/completed response means the round has settled, not that every job
succeeded; inspect existing job states for UNKNOWN/BLOCKED outcomes.
All replicas sharing provider quota must still share the same limit-group key;
different keys do not create independent provider quotas. Do not run older
dispatching revisions concurrently during activation: they lack the new global
completion-aware ceiling.

Each invocation also recovers at most 100 rows per existing expired-state
transition (four UPDATEs), and propagates at most ten previously unreported
failures to their existing source records. Recovery does not resend an expired
IN_FLIGHT request: it becomes UNKNOWN. Saved results resume completion without
AI. A failure claiming the second job still waits for the first job to settle
before returning 503. Same-process overlap returns 200/busy; other replicas
compete using the DB leases, never a process-local lock alone.

## Timeouts, disconnect and shutdown

| Boundary | Setting / behavior |
| --- | --- |
| Anthropic request | Existing 45-second transport timeout, maxRetries=0; round AbortSignal also supplied |
| Queue-related Drive metadata/download/move | 30-second transport timeout, retry=false, same signal; aborted fallback cannot make another request |
| Application work budget | 120 seconds from controller entry, aborting transports and preventing a new AI call after preparation |
| Suggested Cloud Run request timeout | 180 seconds |
| Suggested Scheduler attempt deadline | 210 seconds, including cold-start/network margin |
| Lease | Existing 3 minutes, heartbeat every 30 seconds; in-progress heartbeat is awaited on exit |
| SIGTERM | Stop new rounds, abort active round transports, await full rounds and their jobs before app shutdown |

The handler never uses Promise.race to return while processing continues.
Cancellation during a paid request is ambiguous and becomes UNKNOWN, with no
automatic AI retry or provider fallback. A result already durably saved remains
retryable as completion only. Preparation cancelled before AI can return READY.
The Scheduler retry policy is zero retries; the next scheduled invocation still
runs normally. At-least-once delivery/manual duplicate calls remain safe at the
job/lease boundary; a duplicate invocation may take a different eligible job.

The 120-second budget is **cooperative**, not a promise that every failure can
finish by exactly 120 seconds. The existing TypeORM/catalog/persistence operations
are not generally abortable. The handler waits for them rather than abandoning
live writes. Cloud Run can itself return 504 or terminate a container regardless
of application code; a remote disconnect is not guaranteed to reach Node
immediately. After an exceptional hang or forced kill, lease expiry plus fencing
is the recovery boundary, not a claim that a finally block always executes.
Cloud Run gives approximately ten seconds after SIGTERM before SIGKILL. Validate
DB/Drive tail latency and shutdown under a separately approved synthetic test
before relying on the suggested margins. Do not increase platform deadlines as
a substitute for fixing a hung dependency.

## Background coverage audit

| Existing path | Existing trigger | Covered by this round? |
| --- | --- | --- |
| Shared DOCUMENT / FORM_FILL / TRANSACTION_LINK / already-enqueued GMAIL AI | documentAiDispatch, every 2s | Yes, including cached result reuse |
| Saved shared results and completion retries | documentAiDispatch | Yes; no AI replay |
| Expired shared preparation/AI/completion leases and form expiry | documentAiRecovery, every 30s | Yes, bounded DB recovery |
| Previously unreported shared failures | documentAiRecovery | Yes, up to ten existing source updates |
| Orphan shared upload recovery | DocumentsService.recoverQueuedUploads | **No**; needs a separate request-bound maintenance path or reliable worker CPU |
| 24-hour form temporary-file cleanup/result purge | same method via documentAiRecovery | **No**; scheduler mode suppresses that cron wrapper, so this maintenance needs an explicit replacement before full production activation |
| Durable Gmail message/attachment scan/download | durableGmailScan, every 10s | **No** |
| Gmail handoff into shared queue; saved Gmail persistence, moves and explicit-negative deletion | durableGmailProcessing, every 5s | **No**; shared AI completion only hands results back into this lifecycle |
| Creating nightly Gmail scans | gmailNightlySyncCron, 02:00 Israel | **No** |
| Drive inbox discovery and enqueue | documentInboxOcrCron, every minute; some authenticated user/intake calls | **No**; queued jobs are covered after discovery |
| Protected PDF replacement delivery, abandoned upload recovery and reconciliation | protectedPdfOutbox, every 30s | **No**; a replacement only becomes covered after its existing intake/handoff path enqueues it |
| Automatic transaction classification | AutoClassificationService.tick, every 15s | **No**; separate consent/admin/advisory-lock/model pipeline, outside document concurrency quotas |
| WhatsApp intake, prompts and notifications | three 10s intervals plus webhooks | **No** |
| Billing refunds/renewals | minute/daily cron; separate task endpoints also exist | **No** |
| Open-banking enrollment recovery | 02:45 Israel cron | **No** |

`devCompletionScheduleOptions()` in `billing/domain/dev-completion-mode.ts`
already disables **all** Nest cron jobs, intervals and timeouts when
`DISABLE_SCHEDULED_TASKS=true`, or in the isolated billing completion profile.
This behavior is preserved. It does not disable the authenticated HTTP round.
Do not use BILLING_DEV_COMPLETION_ONLY for this production endpoint: that profile
deliberately allows only its billing/readiness routes.

Keeping other cron registrations enabled does not make them reliable on
request-billed Cloud Run with min=0. Occasional CPU while another request runs
is not a background execution guarantee. Conversely, disabling all schedules
pauses the uncovered rows above; this endpoint does not replace them. **This is
the document execution slice, not approval to declare all Keepintax background
work production-ready.** Orphan upload recovery and temporary cleanup need a
separate bounded authenticated invocation design. Preserve their existing
tag/folder/hash/reference checks and deletion retry limits; do not broaden them
or call the unbounded legacy inbox/nightly loops from this endpoint.

## User-visible latency and cost

Manual uploads and form prefill still durably enqueue and return a receipt; the
upload request does not wait for Scheduler or AI. Existing UI polling continues.
With no backlog, pickup usually adds 0–60 seconds, plus cold start, provider and
completion time. A poll may therefore wait substantially longer than with the
old 2-second dispatcher. Form edits/obsolete-result protections are unchanged.
With short jobs the proposed once-per-minute schedule admits at most **two jobs
per minute**, not 60 despite RPM=60. Backlog, shared quotas and saved completions
can add minutes; interactive 3:1 lane priority does not bypass occupied slots or
this admission cap. Longer rounds can delay the next scheduled execution.
Do not promise real-time form autofill or a production throughput benchmark.

Holding the HTTP request open gives Cloud Run CPU while actual processing runs.
The proposed setup retains request-based CPU allocation and min=0; it does not
require always-on instances. Idle invocations still incur authentication,
startup/DB and Scheduler costs, and a minute cadence does not guarantee a warm
instance. A later larger bounded batch would need separate latency/load review,
while keeping document concurrency at two.

## Operator runbook — commands prepared, NOT executed

Requires separate main-integration, manual-main-test/push, deployment and cloud
configuration approvals. Creating the Scheduler job activates future processing;
do it only after approved deployment and a pending-work review. Do not execute
migrations, document-ai-queue.sql, historical cutover.sql or schema boot sync.
Elazar reported the production schema already applied and verified; this task
did not connect to DB or independently repeat those checks.

Target: project taxmyself-prod, region me-west1, service taxmys16elf-prod. CPU=1,
memory=1Gi, throttling=true, min=0 and max=3 are supplied prior observations,
not freshly verified live settings. No cloud inspection was needed for local
implementation. Use the canonical run.app service URL, without path, query or
trailing slash, for the exact audience. The processing URL adds the path.

Read-only discovery (no secrets in these selected outputs):

```powershell
$schedulerProject = 'taxmyself-prod'
$schedulerRegion = 'me-west1'
$schedulerService = 'taxmys16elf-prod'
$schedulerAccount = 'keepintax-document-scheduler@taxmyself-prod.iam.gserviceaccount.com'
$schedulerUrl = (gcloud run services describe $schedulerService --project=$schedulerProject --region=$schedulerRegion --format='value(status.url)').TrimEnd('/')
gcloud run services describe $schedulerService --project=$schedulerProject --region=$schedulerRegion --format='value(spec.template.spec.timeoutSeconds)'
gcloud scheduler locations list --project=$schedulerProject
```

Use me-west1 for Scheduler only if it appears in that project's supported
locations; otherwise select a supported Scheduler location (for example
europe-west1). The target Cloud Run service stays in me-west1. Do not create a
second job in another location if one already exists.

After explicit cloud-configuration approval, create a dedicated, keyless
invoker identity if it does not exist, then read its immutable uniqueId:

```powershell
gcloud iam service-accounts create keepintax-document-scheduler --project=$schedulerProject --display-name='Keepintax document Scheduler'
$schedulerSubject = gcloud iam service-accounts describe $schedulerAccount --project=$schedulerProject --format='value(uniqueId)'
gcloud run services add-iam-policy-binding $schedulerService --project=$schedulerProject --region=$schedulerRegion --member="serviceAccount:$schedulerAccount" --role=roles/run.invoker
```

Grant the operator creating the job iam.serviceAccounts.actAs on this specific
account (normally roles/iam.serviceAccountUser), plus the required Scheduler
job-management permission. Keep roles/cloudscheduler.serviceAgent on the Google
Scheduler service agent; do not use that agent as the job's client identity.
No project-wide Editor, service-account key or new DB/Drive permission is needed
by the invoking identity. Backend runtime identity/permissions remain unchanged.

The application guard is mandatory even if the frontend-facing service is
network-reachable. It checks Google's signature, expiry, exact issuer/audience,
verified email and immutable subject allowlist. IAM on Cloud Run is service-wide,
not a path-specific replacement for this guard. Do not remove existing public
frontend access as part of this task, or add public access to bypass a 401/403.
Use Scheduler's OIDC Authorization bearer header; never trust unsigned payloads
or the X-CloudScheduler headers. A deployment/proxy stripping the token signature
must be fixed in transport configuration, never by decoding without verification.

Set these **non-secret** values on the approved revision, preserving all other
environment variables/secrets. These are DEV-based starting values, not a
production capacity test and not a claim about values currently in Cloud Run:

```text
DOCUMENT_AI_DISPATCH_MODE=scheduler
DOCUMENT_AI_SCHEDULER_AUDIENCE=<schedulerUrl above>
DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT=keepintax-document-scheduler@taxmyself-prod.iam.gserviceaccount.com
DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT_SUB=<schedulerSubject above>
DOCUMENT_AI_PROVIDER=anthropic
DOCUMENT_AI_MODEL=claude-sonnet-4-6
DOCUMENT_AI_LIMIT_GROUP=prod-anthropic-sonnet-4-6
DOCUMENT_AI_MAX_CONCURRENCY=2
DOCUMENT_AI_RPM=60
DOCUMENT_AI_ITPM=200000
DOCUMENT_AI_OTPM=100000
DOCUMENT_AI_PDF_PAGE_TOKENS=5000
DOCUMENT_AI_IMAGE_TOKENS=5000
DOCUMENT_AI_OUTPUT_ESTIMATE=8192
```

Do not silently change DISABLE_SCHEDULED_TASKS. Inventory the uncovered paths and
provide a separately approved reliable worker/invocation plan before pausing
them or claiming their CPU is guaranteed. NODE_ENV=production,
DISABLE_SYNCHRONIZE=true and SKIP_BOOT_SEED=true must be retained for production.
No Composio re-verification or mail read is needed: operator-verified
COMPOSIO_GMAIL_TOOLKIT_VERSION=20261116_00 and
COMPOSIO_DOWNLOAD_ALLOWED_HOSTS=temp.4d4f16c61d89ec64e760039c4ec50717.r2.cloudflarestorage.com
remain unchanged.

Suggested selective configuration update, after its own approval (not a deployment
command and not executed here). This preserves existing unrelated settings;
review the current schedule-disable flag separately. The invoking account/subject
variables must have been resolved above:

```powershell
$schedulerSettings = @(
  'DOCUMENT_AI_DISPATCH_MODE=scheduler'
  "DOCUMENT_AI_SCHEDULER_AUDIENCE=$schedulerUrl"
  "DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT=$schedulerAccount"
  "DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT_SUB=$schedulerSubject"
  'DOCUMENT_AI_PROVIDER=anthropic'
  'DOCUMENT_AI_MODEL=claude-sonnet-4-6'
  'DOCUMENT_AI_LIMIT_GROUP=prod-anthropic-sonnet-4-6'
  'DOCUMENT_AI_MAX_CONCURRENCY=2'
  'DOCUMENT_AI_RPM=60'
  'DOCUMENT_AI_ITPM=200000'
  'DOCUMENT_AI_OTPM=100000'
  'DOCUMENT_AI_PDF_PAGE_TOKENS=5000'
  'DOCUMENT_AI_IMAGE_TOKENS=5000'
  'DOCUMENT_AI_OUTPUT_ESTIMATE=8192'
) -join ','
gcloud run services update $schedulerService --project=$schedulerProject --region=$schedulerRegion --timeout=180s --update-env-vars=$schedulerSettings
```

After service/account/configuration verification and explicit activation approval:

```powershell
$schedulerLocation = 'me-west1' # substitute a supported location if required
gcloud scheduler jobs create http keepintax-document-ai-minute --project=$schedulerProject --location=$schedulerLocation --schedule='* * * * *' --time-zone='Asia/Jerusalem' --uri="$schedulerUrl/internal/document-ai/round" --http-method=POST --oidc-service-account-email=$schedulerAccount --oidc-token-audience=$schedulerUrl --headers='Content-Type=application/json' --message-body='{}' --attempt-deadline=210s --max-retry-attempts=0 --max-retry-duration=0s
gcloud scheduler jobs describe keepintax-document-ai-minute --project=$schedulerProject --location=$schedulerLocation --format='yaml(name,schedule,timeZone,httpTarget.uri,httpTarget.oidcToken,attemptDeadline,retryConfig,state)'
```

Creation is once only; use jobs update http with the same flags when an approved
job already exists. A future authorized emergency pause is:

```powershell
gcloud scheduler jobs pause keepintax-document-ai-minute --project=$schedulerProject --location=$schedulerLocation
```

Pausing stops future dispatch, not an already-running HTTP round. Do not reset
UNKNOWN jobs to READY, delete retained files, or migrate old quota groups to
clear an alert. Review terminal/blocked outcomes using existing ownership scopes.

## Production acceptance still required

- Review pending jobs/quota groups without executing them, ensure old dispatching
  revisions have zero traffic, verify OIDC denial and exact allowed identity.
- Separately authorize a small synthetic fixture test for two simultaneous
  documents, overlapping invocations across replicas, shared quotas, empty/due
  distinction, result persistence before completion, disconnect/SIGTERM and
  UNKNOWN recovery. This local change uses mocks, not a real MySQL race test.
- Observe request duration/5xx/401/403, cold starts, ready-job age, UNKNOWN and
  completion retry counts, RSS/CPU, Drive latency and provider throttles. Check
  longer PDFs and manual form waiting time before increasing batch size.
- Restore reliable scheduling for every uncovered workflow in the audit before
  declaring the complete production background system ready.
- Separate existing release blocker: backend/Dockerfile still neither installs
  and builds backend/agent nor copies it into the production image. This change
  does not fix it; agent deployment is **not ready** on this evidence. Nest build
  success is not an agent image or container-start validation.

## Official references

- [Scheduler OIDC and invoker permissions](https://docs.cloud.google.com/scheduler/docs/http-target-auth)
- [Scheduler create HTTP CLI](https://docs.cloud.google.com/sdk/gcloud/reference/scheduler/jobs/create/http)
- [Cloud Run request timeouts](https://docs.cloud.google.com/run/docs/configuring/request-timeout)
- [Cloud Run CPU and termination contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud Run service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
