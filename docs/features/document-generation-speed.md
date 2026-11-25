# Document generation speed

Implemented on `codex/document-generation-speed`, based on `c46490a7`.
Schema SQL is prepared only. No database application, production access, live
mail or deployment was performed. A later user-authorized comparison consumed
exactly 24 synthetic FillFaster signature calls; see the
[before/after report](document-generation-speed-benchmark-2026-11-25.md).

## Issuance and email

Issuance reuses its signed original buffer for recipient email. It no longer
uploads and immediately downloads the same PDF for synchronous email. The
recipient checkbox and nonempty email remain required; no email is queued for
pending-allocation creation (the existing behavior). Billing email is unchanged.

With `DOCUMENT_EMAIL_QUEUE_ENABLED=true`, creation inserts one
`document_email_outbox` row using the **same EntityManager/transaction** as the
document, numbering and journal. Failed enqueue rolls back issuance and attempts
the existing uploaded-file cleanup. No background send starts before commit.
The response adds `emailStatus: QUEUED`; it does not claim the email was sent.
When disabled, the established best-effort synchronous mail behavior remains,
but uses the buffer instead of downloading it. Payload preparation remains on
the creation path, so the queued job freezes the intended recipient/content.

The new table is accessed using parameterized SQL and has no TypeORM entity.
It is not implicitly created by synchronize. Apply the separately approved
[SQL](../../backend/scripts/migrations/2026-11-25_document-email-outbox.sql)
before opting in. The same statements appear in
[cutover.sql](../redesign/cutover.sql); use one execution path only. This task
authorizes preparing those files, not running them on any database.

## Dispatch and recovery

For an always-running local process, the default runner checks every ten seconds
and starts immediately after commit. It can reuse the signed original for the
first send through a bounded 32 MiB/60-second process cache. Durable jobs contain
only the original storage path plus the email content, not another PDF copy.
After restart, cache eviction or a different worker claims the job, it downloads
the saved original. That download happens outside the issuance HTTP request.

Cloud Run must use `DOCUMENT_EMAIL_QUEUE_RUNNER=scheduler`, so CPU work is
bound to a request rather than an unreliable background timer. Configure an
authenticated scheduler to `POST /internal/document-email/round`. This reuses
the existing scheduler OIDC verification through `DocumentEmailSchedulerGuard`,
with the same `DOCUMENT_AI_SCHEDULER_AUDIENCE`,
`DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT` and
`DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT_SUB` identity configuration. Email's
activation is independent of `DOCUMENT_AI_DISPATCH_MODE`: enabling email delivery
does not activate/change the AI dispatch mode. Do not enable the email flag until the
SQL and a scheduler invocation/recovery check have separately been authorized
and completed. No scheduler or deployment is provisioned by this change.

In scheduler mode, creation does not retain a PDF buffer or launch fire-and-forget
work. The separate scheduler request downloads the committed original. Enabling
the queue on Cloud Run without scheduler mode fails startup explicitly.

Each round starts at most five jobs over a 45-second admission window, drains
its started delivery, and does not return while a send is pending. Downloads
abort after 15 seconds and enforce 25 MiB; mail uses a separate SDK client with
a real 30-second transport timeout, without mutating shared SDK settings. The
last delivery may extend a round beyond 45 seconds; allow at least 120 seconds
for the scheduler HTTP request. DB query time is additional.

Claims are single atomic MySQL updates; each job gets a unique lease token.
All completions are fenced by that token. The worker verifies that the committed
document still references the same original path, and refreshes its lease just
before calling Brevo. Multiple instances cannot claim the same pending job.

| State | Meaning / action |
| --- | --- |
| PENDING | Committed and waiting for delivery. |
| SENDING | Claimed with a 120-second lease. |
| RETRY | Pre-send attachment failure or explicit HTTP 429; retry after 30, 60, 120, 240 seconds, at most five attempts total. |
| SENT | Brevo accepted the request; this is not proof of recipient inbox delivery. |
| FAILED | Retry limit or explicit permanent provider rejection. Operator attention required. |
| UNKNOWN | Timeout/network/server error or expired sending lease; acceptance may already have happened. Do not automatically resend. |
| CANCELLED | The committed document/original path is no longer available. |

SQL status/error fields and sanitized logs provide operational status. No new
status UI, public status endpoint or automatic resend endpoint is added. An
operator should check provider delivery evidence before any separately approved
manual retry of UNKNOWN, and resolve configuration failures before retrying
FAILED. No exactly-once recipient-delivery guarantee is claimed. A crash after
claim but before send can also require manual resolution of UNKNOWN; it is not
silently dropped or automatically replayed.

Queue logs contain job IDs and allowlisted state/error codes only. Recipient,
body, subject and attachment name are persisted privately in the database and
are not logged by the queued send. Existing unrelated mail callers keep their
transport contract.

## Logo cache

`ImageStorageService.download` caches validated, normalized bytes by the
server-generated immutable UUID storage path. The memory bound is 32 MiB / 128
entries, with a ten-minute TTL and LRU eviction. Concurrent reads of one path
share its download/normalization; errors are never cached, and callers receive
independent buffers. The request still resolves current business identity.
Replacing the logo changes its path; removing it omits it immediately. Already
issued PDF bytes do not change. Authorization remains in the existing image
controllers before cache lookup. This process cache does not change private
HTTP cache headers. First requests and separate instances can still miss it.

## Rendering and signing

Allocation finalization now uses the same shared original/copy model preparation,
original-sign/copy-render overlap and parallel signed-file uploads as regular
manual issuance. The shared upload helper waits for both outcomes and cleans a
successful sibling before propagating failure. Existing allocation, journal,
parent-document and transaction behavior is retained.

By default, copy signing starts as soon as copy rendering is ready while
original signing may still be in flight. `PDF_PARALLEL_SIGNING=false` restores
sequential signing; unset or `true` enables the parallel path. Both settle before success
or failure is returned. Rendering remains sequential; no paid request retries,
unsigned fallback, template changes or new signing service are introduced.
On 2026-11-25 at 10:54 Asia/Jerusalem, Elazar supplied the provider's reply
from Banal Sadon explicitly confirming that two requests can run in parallel
on either the same template or separate templates. This supersedes the original
opt-in restriction. The provider did not supply a numeric quota, request-rate
limit or exact over-limit response in that reply. No account-wide allowance was
inferred; each pair overlaps at most two calls, on top of already concurrent
issuance requests. No new retries or automatic serial fallback are added on a
provider error, so ambiguous/paid outcomes cannot be replayed automatically.

The official [developer reference](https://help.fillfaster.com/developers/api/)
alone did not establish concurrency support; the user-supplied provider reply
is the evidence for this default change. The later authorized before/after
comparison used 24 paid/quota-consuming synthetic signatures; it made no runtime
environment/deployment change.

## Verification and measurement limits

The [measured comparison](document-generation-speed-benchmark-2026-11-25.md)
separates actual FillFaster requests from controlled local I/O and includes small
or negative results. It does not establish complete production request latency.

Focused tests use controlled promises to prove overlap, transaction ordering,
failure draining, retry/unknown policies and cache invalidation. They do not
measure provider latency or execute the prepared MySQL DDL. Backend Nest build
verifies integration/compilation; no full Nest bootstrap or database connection
is needed. No frontend code, document layout or accounting logic changed.

Before enabling the new queue, an authorized isolated DB check must apply its
DDL, create an intentional test document, verify rollback/nonselection, restart
pending-job recovery, competing worker claims and the authenticated scheduler.
Compare development `pdf_http_total`, `pdf_create_stages` and per-operation spans
for intentional successful documents, with/without logo and email, cold/warm.
Do not sum overlapping parent/child spans. Measure successful signing separately to quantify the real saving; never create an extra numbered document solely to
probe readiness. No new production speedup percentage is claimed.
