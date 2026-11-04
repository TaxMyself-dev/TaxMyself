# WhatsApp intake

## Lychee adapter (2026-10-25)

Approved owner mapping for this adapter is either User.phone or the existing
User.spousePhone (normalized), with ambiguous or unknown accounts rejected.
Both map to the same account and all its businesses; no filtering by spouse
business role. One business imports directly, multiple businesses always ask.
Intake, question preflight and result delivery share this lookup. Cross-account
collisions across either field reject; matching both fields on one row is one
account. Replies go to the original sender; quote ownership stays phone-scoped.
This overrides the simulator-only rule
below for Lychee. Every import requires an explicit currently owned business.
POST /webhooks/lychee validates raw HMAC and channel before durable enqueue.
Provider sender_phone may be null, missing or blank: use normalized contact_phone
in that case. A malformed or conflicting nonempty sender must still be rejected.
LycheeEventStore uses explicit SQL; its table MUST NOT join TypeORM synchronize.
Elazar approved preparing its SQL only; no database execution was authorized.
The receiver loads with normal backend startup; no intake enable flag is needed.
After durable enqueue, the document worker is woken via a coalesced setImmediate;
after document/outbox commit, prompt delivery is woken the same way. Both retain
10-second polling as backup, existing running guards and atomic SQL leases.
Signals during busy/polling work are retained; immediate bursts drain via fresh
claims. Webhook acknowledgments never await media, Drive or outbound sending.
Multi-business
documents remain WAITING_FOR_BUSINESS. Document metadata/choices and one prompt:
outbox draft are staged transactionally before media download. New documents
download a fresh media link only after business selection; existing retained bytes
are reused. No detached media task or guessed business is introduced.
User authorized code support for development and production delivery. The bound
ConfiguredLycheeTransport requires matching NODE_ENV / DB_DATABASE / DataSource
configuration and actual SELECT DATABASE(): development -> keepintax-dev,
production -> keepintax-prod. Backups, copies, mixed pairs and unset/test runtimes
are blocked. Key/channel/quote are required; configuration drift during the check
is blocked. No new enable flag. No live production access or sends are authorized
for agent verification; use mock HTTP/SQL only. Production idempotency uses its
own namespace; legacy development keys remain byte-for-byte unchanged.
Tests mock HTTP; NoSendPromptTransport remains for offline use. Provider receipts live
in outbox JSON; only the document gets prompt_whatsapp_message_id. UNKNOWN sends
must not be retried blindly; persisted receipts retry linking only. Never invent
provider IDs or route to a primary business. Tests use fake IDs in fake SQL only.
Signed POST /webhooks/lychee/reply-owner is read-only and queries persistent
document prompt ownership (including completed rows). It must not enqueue or
call selectBusiness. recordPrompt binds real provider IDs for a future sender.

Document result notifications use `notice:` rows and `NOTICE_*` states in the
same table. Terminal document updates and result drafts commit atomically.
Transient retries and business-selection waits do not announce failure.
Result notification delivery has a SEPARATE transport token. User subsequently
authorized result delivery: it uses the same ConfiguredLycheeTransport environment
guard for development and production. NoSendNotificationTransport remains for
offline tests. Never trigger live messages during agent verification. Recorded receipts
recover persistence only; unknown send
results must not be resent blindly. NOTICE_SENT means provider acceptance, not
confirmed delivery to the phone. No historical completed rows are backfilled.
Fixed intake rejection explanations (ambiguous/unknown/changed account, unsupported
media and invalid quoted business selections) go to the authenticated event sender
without selecting an account. These drafts must have no owner/business/Drive
identity, use fixed text, and still pass parent/hash/channel/phone/quote and runtime
checks. Account-free final FAILED/BLOCKED_IMPORT notices are similarly generic.
Account/business-specific success and result notices retain ownership checks.
Typed local blockers DRIVE_FOLDER_MISSING, UNSUPPORTED_MEDIA_CONTENT and
INVALID_MEDIA_SIZE finalize as BLOCKED_IMPORT with last_error + a specific result
notice in one transaction, without increasing attempts or waiting for five retries.
HTTP/network/unknown failures remain retryable; never infer permanence from 4xx.
Lychee supplies traceEventId to the shared importer for safe drive.import.* phase
timings. Trace IDs are not persisted; no request, content or raw error is logged by
the new phase tracer. Agent verification remains mocked-only; do not start the app.
Repeated valid choices for an already selected document stage an explanation as
BUSINESS_LOCKED on the incoming reply row, atomically with its result notice.
Never update/reimport the original document. Snapshot its chosen business and
question/document identities; revalidate that context and current ownership before
delivery. A repeated webhook event produces one notice; a new click is a new reply.

## Existing development simulator

Development only. Explicit operator-provided test bindings are not account verification.
All endpoints require WHATSAPP_DEV_ENABLED=true and a development token of at least
24 characters. They return 404 in production. Never infer ownership from User.phone.
Always resolve an explicit business before calling the shared document importer.
The standalone sandbox binds to loopback and never loads dotenv or real credentials.
No live Meta webhook, phone-linking flow, new tables or production integration yet.

Document intake uses existing API_IMPORT source; do not extend the database enum
without the schema approval required by docs/coordination/AUTHORITY.md.
The sandbox uses DocumentImportService with fake repository and Drive boundaries.
Only the normal application's development module uses real DocumentImportModule.
Event dedup is bounded in-memory state for this checkpoint, not a production queue.
Failed imports are not cached as completed. Reply text is a preview, never sent.
