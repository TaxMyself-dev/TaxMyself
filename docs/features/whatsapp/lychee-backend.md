# Lychee backend intake

Implemented locally; no cloud deployment and no messages sent. The endpoint is
`POST /webhooks/lychee`. The proxy entry remains `POST /lychee/webhook`.
Configure the proxy dev/prod destinations with the FULL backend path (through
ngrok for dev). Both hops verify the same raw-body HMAC and channel.

## Activation prerequisites

1. Review and separately authorize execution of
   `backend/scripts/migrations/2026-10-25_lychee_intake.sql` on the intended
   development database. On 2026-10-25 Elazar separately approved execution and
   the table was created and verified (22 columns) on keepintax-dev only.
   The table is deliberately absent from TypeORM entities/synchronize.
2. Configure backend `LYCHEE_WEBHOOK_SECRET`, `LYCHEE_CHANNEL_ID`, and
   `LYCHEE_API_KEY` in ignored server environment. The secret is supplied by
   Lychee after subscription setup. API key requires conversations:read;
   this implementation has no send client and does not use write access.
3. Set `LYCHEE_MEDIA_HOSTS` to `shxsdijepxzybjjhxxjz.supabase.co`, confirmed
   by Lychee. The allowed path is `/storage/v1/object/sign/wap-media-private/`.
   Links expire per `expires_in_seconds`; a fresh URL is requested on every
   download attempt and never persisted. Redirects are not followed.
   Download fails closed until configured. Only public IPv4 DNS answers are
   supported; redirects, private destinations and API credential forwarding
   to media storage are prohibited.
4. The receiver loads on normal backend startup without an intake enable flag.
   A missing secret/channel yields 503, never silent route absence.
   Queue processing runs automatically with normal backend startup. No separate
   worker enable flag is used. New events and existing pending/retry rows are
   processed; existing FAILED rows still require explicit retry handling.
5. Configure proxy routing and a verified ngrok URL. Deployment, cloud config,
   live callbacks and sending remain separate authorized actions.

## Processing

The receiver verifies signature, channel, sender/contact equality when sender
is nonempty (otherwise contact_phone is used), and bounded
event shape. It commits the event to SQL before acknowledging with HTTP 200.
Failed storage returns 503; conflicting reuse of event_id returns 409.
Retries with identical payload are acknowledged without a new job.

A 10-second worker interval atomically claims one row using a unique lease.
Lease duration is five minutes, allowing recovery after process termination.
Temporary failures retry after 60 seconds, up to five processing attempts before
FAILED. SQL stores generic error codes only. Operators must monitor FAILED and
WAITING_FOR_BUSINESS; there is currently no admin queue UI or automatic alert.
Queue tests use mocks; MySQL concurrency/DDL still require an authorized dev test.

User.phone from signup is the approved mapping for this adapter; it does not
assert independent phone verification. Local Israeli format and international
format normalize to the same number. Unknown or ambiguous users are rejected.
Only numbered businesses owned by that user qualify; no accountant delegation or
primary-business fallback. This policy must be revisited before broader rollout
if shared/reassigned phone numbers are possible.

PDF/JPEG/PNG are identified from bytes, at most 10 MiB. The existing importer
performs user/business-scoped content dedup and Drive inbox upload (API_IMPORT).
Database/import errors do not produce successful import state. Terminal
completion removes staged bytes.

## Persistent test routing

The proxy now stores test routing directly in the development database. The
temporary backend `/test-route` endpoint and routing service were removed.
`LYCHEE_TEST_PHONES` is needed only on the proxy for this flow. No production
backend deployment is required to enable test commands or unquoted dev uploads.
See [proxy database setup](lychee-proxy-database.md).

Standalone text `בדיקות` selects dev; `סיום בדיקות` selects prod. Default is prod,
and the mode lasts until stopped, separately for each channel/sender. Captions,
quoted replies and other text are not commands. No outbound confirmation is sent.
Quoted replies continue to use persistent question ownership instead of this mode.

The existing intake table holds terminal `ROUTE_COMMAND_DEV/PROD` and
`ROUTE_DEV/PROD` journal rows under hashed `route:` IDs, separate from actual
intake IDs. The document worker never claims these statuses. Original signed
bytes are forwarded unchanged; only the routing journal normalizes occurred_at
to UTC. Routing uses provider event timestamps rather than delivery order, and a
repeated event returns its original stored decision. An altered duplicate or
opposite commands with identical timestamps fail closed. Commands not yet
delivered cannot influence an already committed decision: verify activation in
logs before sending test documents.

A connection-scoped MySQL advisory lock serializes decisions per database,
channel and sender across proxy replicas; individual INSERTs are atomic.
Locks are released in finally and by MySQL if the connection dies. Failed locks,
missing DB/table or missing allowlist never silently select production. Existing
table schema, accounting logic and permissions are unchanged; no SQL was run.
Focused concurrency tests use fake storage; live Cloud Run connectivity and
multi-connection MySQL verification remain deployment verification steps.

## Multiple businesses / sending disabled

Each document is downloaded immediately and retained in its own SQL row as
WAITING_FOR_BUSINESS, with a snapshot of business choices. No question is sent.
The selection flow builds a vendor-compatible preview
quoted to the original document. New choice snapshots contain short unique
labels with business names (number fallback); up to three choices use buttons,
larger lists use a numbered quoted text menu. The future sender must use these
stored labels, not recalculate labels from a potentially reordered business list.
The document and a durable question draft are staged in one SQL transaction.
`business.prompt.queued` logs only a count, never the question/recipient content.
The delivery worker and HTTP adapter exist, but the registered transport is
NoSendPromptTransport. Normal startup cannot send or generate fake provider IDs.
See [question delivery](lychee-question-delivery.md) for receipt-first recovery,
duplicate prevention and the unknown-result policy.
`prompt_whatsapp_message_id` is reserved for the future authorized send adapter;
do not populate it with a guessed or unrelated ID. Without an actual prompt
mapping, replies are ignored and cannot assign documents.

`LycheeEventStore.recordPrompt(eventId, channelId, owner, promptId)` persists the
real WhatsApp ID returned by the future send adapter, scoped to owner/channel and
a waiting document. It refuses overwriting an unrelated ID. The question worker
retries a failed mapping using the durable receipt, without another send. No
provider idempotency guarantee is assumed: uncertain sends without a persisted
receipt stop in PROMPT_UNKNOWN and require reconciliation rather than blind retry.

`POST /webhooks/lychee/reply-owner` verifies the ORIGINAL signed incoming event,
requires a quoted message ID, and returns `{ownsReply: boolean}` from SQL.
It matches channel, normalized sender and prompt ID, including completed
documents for late/duplicate replies; duplicate mappings fail closed. It performs
no queue insertion or document processing. Missing table/DB fails the lookup.
For allowlisted testers the proxy now queries the development table directly:
a known dev question forwards only to dev, including after tests end. An unknown
reply in active test mode returns 409 without probing production. If tests are
inactive and no dev mapping exists, production ownership is queried as before.
Unlisted senders can resolve production ownership only. SQL failure or duplicate
development mappings never fall back to another environment. No new table,
schema, proxy DB credentials or mutable in-memory proxy mappings were added.
Support prompt ownership is not included in this document-only resolver; its
future integration must extend the resolver without creating another webhook.

When a mapped quoted reply arrives, selection is matched by channel, normalized
sender, owner, prompt ID and unique label. The document is queued independently;
current ownership is checked again and staged bytes reused. This supports
out-of-order choices without retaining a global active business.

Waiting rows contain private document bytes. Use access-restricted development
storage with adequate MySQL max_allowed_packet (>10 MiB plus metadata).
Define retention/expiry, encryption and cleanup policy before production use;
no automatic deletion or retention job was introduced without a product decision.

## Verification and limits

### Structured operational logs

New backend `[Lychee]` records are JSON with `event_id`, `stage`, `outcome`, a
human-readable Hebrew `message`, and optional duration, attempt count, byte count,
HTTP status or safe transport/database code. Progress uses DEBUG (already enabled
by main.ts); blocked/failed outcomes use WARN. Empty worker polls are not logged.
Filter by event_id to follow webhook.receive -> queue.save/claim -> user.lookup
-> business.lookup -> media.link/url/dns/download/validate -> drive.import/result
-> queue.complete. Multi-business waits and text replies are explicitly described.
Duplicate delivery is distinguished from a newly queued event. Retry scheduling
states 60 seconds; the fifth failed attempt explicitly reports FAILED.

Remote HTTP 500 is explained as a remote-server error at the actual failing
stage. URL/bucket checks, missing API key, missing Drive folder, database table
absence, unsupported content and quota-related import failures have readable
messages. Unknown errors are described without dumping their original text.
No new log includes full phone numbers, names, filenames, message text, raw
payload, authorization headers, signing secrets, signed URLs or file bytes.
These controls apply to the new Lychee logs; existing shared importer/Drive
service logs are separate and were not rewritten in this task.

Proxy JSON logs identify validation, destination environment, reply ownership,
downstream status and network failure. They appear in cloud logs only after an
authorized proxy deployment. Local backend logs appear after the normal restart
or watch recompilation. Nothing is deployed automatically.

### Development receiver prepared 2026-10-25

Normal startup is `npm run start:watch` from this worktree's backend directory.
The optional legacy `node scripts/start-lychee-receiver.js` launcher starts the
built app on port 3000 with schema synchronize and boot seeding disabled; as of
2026-10-29 it no longer disables scheduled work. It requires keepintax-dev.
`DISABLE_SCHEDULED_TASKS=true` remains a general explicit scheduler override;
normal startup does not set it.
Legacy launcher logs go to ignored `.lychee-receiver.log`. No send API exists.

The existing ngrok agent was verified forwarding the fixed domain to port 3000:
`https://margeret-guttiform-overfondly.ngrok-free.dev/webhooks/lychee`.
Empty POSTs to both localhost and this public URL returned 503, as expected
while LYCHEE_WEBHOOK_SECRET is missing. No event was enqueued. Receive the secret,
set it in this worktree's ignored environment and restart before Lychee sends
their signed test. Configure API key and media hosts for successful processing.
This test URL goes directly through the existing ngrok tunnel; the cloud proxy
has not been modified/deployed. The same tunnel can serve CardCom/Feezback paths.

Focused Jest tests exercise signature bytes, HTTP rejection/acknowledgment,
dedup conflict, media destination safety, single/multi-business routing, retained
bytes and ownership. Automated tests mock HTTP/media/Drive/SQL boundaries.
The development schema and unsigned ngrok connectivity were verified separately
as described above. Signed Lychee events and actual document/Drive import have
not been verified end-to-end. Sending business questions remains absent.
