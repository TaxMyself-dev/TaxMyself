# Billing completion with Cloud Tasks

## Local implementation status

This replaces the minute PDF/email recovery cron. Initial capture/activation and
manual send behavior stay synchronous; failed or crashed completion is dispatched
by Cloud Tasks. The DB is authoritative, using the existing billing_attempt state,
schedule, version and lease, and billing_event.metadata.receiptEmail delivery state.
There is no schema change or new outbox table. Refund recovery remains separate.

The feature is OFF unless BILLING_TASKS_ENABLED=true. No Google credentials are
resolved and no tasks are created while disabled. No dev/prod infrastructure,
credentials or environment file was changed as part of the code implementation.
The previous minute cron is removed, including when this feature is disabled.
Do not enable the feature before queue/IAM/Scheduler validation below.

## Reliability and identity

- Capture/admin-resolution transactions commit before enqueue. Finalization and
  email claims also commit crash wake-ups before PDF/storage/mail I/O; failure
  transactions commit their retry dates before enqueue. Enqueue failure never
  converts a verified charge into a retryable provider submission.
- Payload is only {kind: CAPTURE, id: attemptId} or {kind: MAIL, id: eventId}.
  No payment, recipient, storage path or credential is supplied by the task.
- POST /internal/billing/completion requires a Google-signed ID token, exact
  configured audience, Google issuer, verified service-account email, subject and
  unexpired token. X-CloudTasks headers never authenticate a request. Ordinary
  customer Firebase authentication does not grant access to this endpoint.
- The worker reloads the DB and uses the existing exclusive finalization/mail
  leases. Completed/missing/ineligible work is acknowledged as a no-op; a DB error,
  live lease, future retry or transient completion error returns non-2xx so the
  queue retries. Refund/UNKNOWN/DECLINED attempts are never submitted as charges.
- Mail tasks work for completed and legacy charges independently of attempt status.
  They download the linked PDF only, never generate an invoice or charge again.
- DB retry gates remain 1/5/15/30 minutes then hourly. Cloud Tasks retry backoff
  adds latency; these are not exact delivery times. A lease crash waits five
  minutes plus its persisted delay. HTTP dispatch deadline is 240 seconds.
- Explicit task names are hashed from ids/schedule/generation and coalesce repeated
  notifications. Only Google's ALREADY_EXISTS response is treated as a duplicate.
  This is not exactly-once execution. An ambiguous mail API response or crash after
  acceptance can duplicate email; no provider idempotency guarantee is invented.

## The daily repair job is required

MySQL commit and Cloud Tasks creation are not atomic. A crash between them, queue
retention or retry exhaustion can leave pending DB work with no live task. A
Cloud Scheduler job must POST /internal/billing/repair once daily at 04:00
Asia/Jerusalem using the same verified Google identity/audience. This external
invocation works with an idle/scaled-to-zero Cloud Run instance; no application
timer or minute polling is registered for completion recovery.

Repair scans due captures and explicitly attempted/failed invoice emails only,
using ascending-id pagination (100/page, at most 20 pages per kind). It enqueues
work and never executes receipts, mail, activation or money operations itself.
A new daily task-name generation bypasses old completed/exhausted task tombstones;
repeated repairs in one day coalesce. One failed capture scan cannot suppress mail
repair. Partial errors/queue failures or the 2000-row cap log an operator error and
return 503 so Scheduler can retry. Persistent cap/DB/queue errors require operator
review; there is no claim of unlimited automatic backlog recovery.

## Development configuration

Only configure a verified development project and keepintax-dev database. These
are names/URLs, not secrets. ADC belongs to the runtime; never paste or commit a key.

```dotenv
BILLING_TASKS_ENABLED=false
BILLING_TASKS_PROJECT_ID=YOUR_DEV_PROJECT_ID
BILLING_TASKS_LOCATION=YOUR_DEV_QUEUE_REGION
BILLING_TASKS_QUEUE=billing-completion-dev
BILLING_TASKS_TARGET_URL=https://YOUR_DEV_BACKEND/internal/billing/completion
BILLING_TASKS_AUDIENCE=https://YOUR_DEV_BACKEND
BILLING_TASKS_SERVICE_ACCOUNT=billing-worker@YOUR_DEV_PROJECT_ID.iam.gserviceaccount.com
BILLING_TASKS_EXPECTED_DATABASE=keepintax-dev
BILLING_CHARGE_TASKS_ENABLED=false
BILLING_CHARGE_TASKS_QUEUE=billing-charge-dev
BILLING_CHARGE_TASKS_TARGET_URL=https://YOUR_DEV_BACKEND/internal/billing/charge
BILLING_CHARGE_TASKS_AUDIENCE=https://YOUR_DEV_BACKEND
```

The charge queue is a separate, explicit opt-in. When enabled, a definitive
renewal decline commits its next attempt time first and then enqueues exactly
one task for that subscription and DB generation, scheduled thirty minutes
later. The worker reloads the subscription and rechecks status, attempt count,
period and due time before any provider call. The initial attempt plus two
thirty-minute retries is the maximum; UNKNOWN and MANUAL_REVIEW are never charge
tasks.

Configure Cloud Scheduler to POST `/internal/billing/charge-repair` every five
minutes with the charge audience/identity. It only republishes missing due tasks
for ACTIVE/STANDARD subscriptions with renewalAttempts 1–2; it never calls
CardCom. Configure a separate five-minute POST to `/internal/billing/reconcile`
with the completion audience/identity. Reconciliation performs read-only
CardCom lookups, including hosted checkouts stale for one hour. These schedules
are required to repair DB-commit/enqueue gaps and ambiguous provider outcomes;
they do not broaden the three-attempt limit.

When enabled, incomplete configuration, HTTP URLs, a wrong completion path or a
mismatched actual database fail startup. For Cloud Run IAM, audience normally uses
the service's base URL; both Google IAM and the application must accept that exact
audience. Target and audience cannot include credentials, query or fragment.

Dev provisioning checklist (template; actual dev provisioning is recorded below):

1. Verify the explicit dev project, region, HTTPS backend and DB binding. Enable
   Cloud Tasks/Cloud Scheduler APIs there. Create the dedicated dev queue and worker
   service account in that project. Do not alter production services/credentials.
2. Give the backend runtime identity roles/cloudtasks.enqueuer for this queue and
   iam.serviceAccounts.actAs (roles/iam.serviceAccountUser) on the worker identity.
   Keep the Cloud Tasks service agent's service-agent role. Where Cloud Run is
   IAM-private, grant the worker roles/run.invoker on the dev service. The scheduler
   invoker needs permission to mint an OIDC token for the same verified identity;
   retain the Cloud Scheduler service-agent role. Do not grant broad project admin.
3. Configure the dedicated queue's bounded delivery policy, for example:

```powershell
gcloud tasks queues update billing-completion-dev --project=YOUR_DEV_PROJECT_ID --location=YOUR_DEV_QUEUE_REGION --max-concurrent-dispatches=2 --max-dispatches-per-second=1 --min-backoff=60s --max-backoff=3600s --max-doublings=5 --max-attempts=100 --max-retry-duration=604800s
```

4. Configure the daily safety job (use explicit dev values):

```powershell
gcloud scheduler jobs create http billing-completion-repair-dev --project=YOUR_DEV_PROJECT_ID --location=YOUR_DEV_SCHEDULER_REGION --schedule="0 4 * * *" --time-zone="Asia/Jerusalem" --uri="https://YOUR_DEV_BACKEND/internal/billing/repair" --http-method=POST --oidc-service-account-email="billing-worker@YOUR_DEV_PROJECT_ID.iam.gserviceaccount.com" --oidc-token-audience="https://YOUR_DEV_BACKEND" --attempt-deadline=300s --max-retry-attempts=3 --min-backoff=60s --max-backoff=3600s
```

5. Describe/verify the dev queue, identity bindings and daily job before setting
   BILLING_TASKS_ENABLED=true. Inspect task creation/delivery and Scheduler results
   with synthetic dev rows/test recipient only. No full application boot is needed
   for unit tests; do not run against production, a prod copy or real customers.
6. Monitor enqueue failures, daily-repair errors/caps, queue retry exhaustion,
   oldest pending DB work and Scheduler failures. Disabling/purging a queue does not
   resolve DB work; preserve pending state and repair after restoring service.

## Development acceptance checks

Mock tests cover deterministic/minimal tasks, enqueue failure and duplicate names,
commit-before-enqueue and rollback, crash wake-ups, DB retry/lease gates, verified
OIDC identity and spoofed headers, duplicate terminal delivery, mail with an existing
PDF/completed attempt, disabled configuration and bounded paginated daily repair.

Live dev verification remains required: timeout PDF/mail, kill after DB commit and
after claim, deny task creation then run daily repair, duplicate/multi-instance
delivery and manual-send races, wrong identity/audience, forced queue exhaustion
then next-day repair. Snapshot invoice id/count and journal count; verify zero new
charges, unchanged provider transaction id and reuse of the same invoice/PDF.
Mock tests do not prove IAM, runtime credentials, real storage/signing or delivery.

Official references:
- [HTTP tasks, payload and OIDC](https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks)
- [Queue retry/rate configuration](https://docs.cloud.google.com/tasks/docs/configuring-queues)
- [Task names and deduplication](https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks#naming_tasks)

## Verified development provisioning (2026-11-02)

After explicit user authorization, keepintax-dev (project number 41317664815) now
has queue billing-completion-dev in europe-west1, state PAUSED, empty at read-back.
The queue uses the bounded retry/rate policy above. me-west1 is not a supported
Cloud Tasks region; use europe-west1 for this dev queue. The worker identity is
billing-worker@keepintax-dev.iam.gserviceaccount.com. Required Tasks/Scheduler/IAM
APIs and Google service-agent roles were verified; no service-account key exists
from this setup. Setup-user access is scoped to the queue and worker account.

Local application/tunnel, runtime ADC, task environment settings, the daily repair
job and live dev acceptance have not yet been connected. No existing env or
credentials were changed, and no application/DB/production access was performed.
Keep the queue paused until these activation prerequisites are verified. The
backend runs on the developer computer, so Scheduler/Tasks need an active HTTPS
tunnel; a deployed Cloud Run dev service is not required.

### Local tunnel preparation follow-up

The local ngrok endpoint was verified forwarding port 3000. The daily dev job
billing-completion-repair-dev has now been created in europe-west1, configured for
04:00 Asia/Jerusalem with the exact worker OIDC identity, and verified PAUSED.
The feature worktree's ignored env now contains task-specific settings only,
with BILLING_TASKS_ENABLED=false after verifying DB_DATABASE=keepintax-dev.
The running port-3000 backend belongs to main, which does not yet contain the
Cloud Tasks feature; it was not restarted or modified. Runtime ADC is also absent.
Queue/job remain paused pending runtime credentials, backend feature availability
and live dev acceptance. CLI authentication is separate from runtime ADC.

## Connected local development runtime (2026-11-02)

The feature backend now runs on port 3000 through the verified HTTPS tunnel,
using the compiled worktree code via npm run start:billing-completion-dev.
main remains unchanged. The launcher loads this worktree env explicitly, pins
port 3000, disables schema sync and boot seed, and selects a completion-only profile.
All Nest cron/interval/timeout decorators are disabled. Every CardCom network
entry point (including reads/refunds) rejects before any provider request. Only
GET/HEAD health/readiness, OPTIONS and authenticated task POST routes are exposed;
other application routes return 503. Restart this command after a backend rebuild.

Runtime ADC consent succeeded and the official client independently read the dev
queue with quota_project=keepintax-dev. The ignored local task flag is enabled.
The queue is RUNNING/empty and the daily Scheduler job is ENABLED at 04:00
Asia/Jerusalem. Both remain development-project resources only.

Live acceptance used MAIL id 2147483647, verified absent from the actual
keepintax-dev database before publication. The application's compiled publisher
created the only queued task; Google delivered it with worker OIDC through ngrok,
HTTP 204 was observed, and the task was automatically removed. The existing
Scheduler repair job was then forced once after verifying no pending capture/mail
work; its authenticated repair request also returned 204. Queue was empty after.
The DB retained 11 attempts, 46 documents and 94 events before/after; no mail,
invoice, charge, refund, schema or billing-record write occurred during acceptance.
Keepintax-dev database binding was checked with SELECT DATABASE before any query.

This proves ADC -> Cloud Tasks -> Google OIDC -> ngrok -> updated local worker ->
dev DB lookup/ack, plus Scheduler identity/repair delivery. It does not replace the
previously documented live failure/crash/PDF/mail acceptance scenarios. No real
customer invoice or email was processed. If the PC/tunnel is unavailable, remote
delivery retries according to the configured policies; update task env and job
target/audience if the tunnel URL changes. No credentials are committed.


### Verified controlled recovery results

On 2026-11-02 the real dev DB, compiled worker, Google Cloud Tasks/OIDC and
local Chromium renderer passed both controlled failure scenarios on existing
invoice 30000 (document 19, attempt 2, event 50). PDF generation failed once,
remained CAPTURED with the same document pointers, then recovered after the
real scheduled retry. Mail then failed once with socket hang up while the
attempt was COMPLETED; its second delivery attempt succeeded using identical
PDF paths and SHA-256, without rendering again. No retry timestamp was advanced.
No new invoice or charge attempt was created. Provider calls and invoice
creation were blocked. Signing, Firebase storage and Brevo were replaced with
local preview files/MIME sink, so this does not verify real provider delivery.

The runner snapshotted/restored the legacy canonical links and five affected
rows, removed only its tagged audit events and exact recorded tasks, and
verified final counts: 11 attempts, 46 documents, 94 events. Original stored PDFs
were never read or modified. Normal isolated worker was restarted without fault
adapters; dev queue resumed RUNNING and daily Scheduler ENABLED. Production,
main and GitHub were untouched.

Reproduction: build backend, pause the dev Scheduler, ensure the queue is empty,
then run `node scripts/qa/verify-billing-recovery-dev.cjs init`. Start the isolated
worker with BILLING_DEV_RECOVERY_PROBE_CONFIG pointing at the returned private
config.json, then run `node scripts/qa/verify-billing-recovery-dev.cjs run PRIVATE_RUN_DIRECTORY`.
The runner validates actual DB and ADC quota project, restores fixtures in finally
and leaves queue/Scheduler paused for normal-worker restart and explicit resume.
Keep the private snapshot until restoration succeeds; never commit it. The
fixture intentionally supports only the verified existing dev records and fails
closed when their prerequisites differ. It is not a legacy data migration.

## Paused production charge-retry infrastructure (2026-11-10)

The following resources were provisioned in project `taxmyself-prod` as a
fail-closed release prerequisite. They are intentionally paused and cannot yet
dispatch charge work:

- Cloud Tasks queue `billing-charge-prod` in `europe-west1`, state `PAUSED`,
  with at most 2 concurrent dispatches and 1 dispatch per second. Its retry
  policy is 100 attempts over 7 days with 60-second minimum and 3600-second
  maximum backoff.
- The Cloud Run runtime service account has queue-scoped
  `roles/cloudtasks.enqueuer` on that queue.
- Scheduler jobs `billing-charge-repair-prod` and
  `billing-reconciliation-prod`, both state `PAUSED`, scheduled for minute 10
  of every hour in `Asia/Jerusalem`. They target
  `/internal/billing/charge-repair` and `/internal/billing/reconcile`
  respectively, using the existing billing worker OIDC identity and the Cloud
  Run service URL as audience.

The charge-task environment variables are not configured and the feature code
has not been deployed to production. After a fresh operator-managed backup, the
additive KT-105 schema was applied and verified on `keepintax-prod`: all payer
profile and attempt columns exist, all four enum additions are present, and the
new payer-profile table contains zero rows as expected before application
deployment. No data backfill is required. No task was dispatched and no CardCom
request, payment, receipt or subscription transition occurred during
provisioning. The existing completion queue and its daily repair Scheduler
remained unchanged and were re-verified separately.
