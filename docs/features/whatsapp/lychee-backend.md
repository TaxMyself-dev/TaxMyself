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
3. Set `LYCHEE_MEDIA_HOSTS` to a comma-separated list of EXACT media hostnames
   confirmed by Lychee. The API documentation gives only a placeholder URL.
   Download fails closed until configured. Only public IPv4 DNS answers are
   supported; redirects, private destinations and API credential forwarding
   to media storage are prohibited.
4. The receiver loads on normal backend startup without an intake enable flag.
   A missing secret/channel yields 503, never silent route absence.
   Set `LYCHEE_WORKER_ENABLED=true` separately to process queued documents.
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

## Multiple businesses / sending disabled

Each document is downloaded immediately and retained in its own SQL row as
WAITING_FOR_BUSINESS, with a snapshot of business choices. No question is sent.
`prompt_whatsapp_message_id` is reserved for the future authorized send adapter;
do not populate it with a guessed or unrelated ID. Without an actual prompt
mapping, replies are ignored and cannot assign documents.

`LycheeEventStore.recordPrompt(eventId, channelId, owner, promptId)` persists the
real WhatsApp ID returned by the future send adapter, scoped to owner/channel and
a waiting document. It refuses overwriting an unrelated ID. This method is not
called by a live sender: none exists yet. A failed mapping write after sending
must be retried using the same provider send idempotency key, not a new question.

`POST /webhooks/lychee/reply-owner` verifies the ORIGINAL signed incoming event,
requires a quoted message ID, and returns `{ownsReply: boolean}` from SQL.
It matches channel, normalized sender and prompt ID, including completed
documents for late/duplicate replies; duplicate mappings fail closed. It performs
no queue insertion or document processing. Missing table/DB fails the lookup.
The proxy queries this endpoint before forwarding quoted events. No new table,
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

### Development receiver prepared 2026-10-25

`node scripts/start-lychee-receiver.js` starts the built app on port 3000 with
synchronize, boot seeding, all scheduled tasks and the Lychee worker disabled.
It requires keepintax-dev. `DISABLE_SCHEDULED_TASKS=true` disables cron/interval/
timeout registration; normal launches retain their previous scheduling defaults.
Logs go to ignored `.lychee-receiver.log`. This launch is for subscription setup,
not end-to-end import testing. It does not change the .env or expose a send API.

The existing ngrok agent was verified forwarding the fixed domain to port 3000:
`https://margeret-guttiform-overfondly.ngrok-free.dev/webhooks/lychee`.
Empty POSTs to both localhost and this public URL returned 503, as expected
while LYCHEE_WEBHOOK_SECRET is missing. No event was enqueued. Receive the secret,
set it in this worktree's ignored environment and restart before Lychee sends
their signed test. Keep the worker off until media/key settings are configured.
This test URL goes directly through the existing ngrok tunnel; the cloud proxy
has not been modified/deployed. The same tunnel can serve CardCom/Feezback paths.

Focused Jest tests exercise signature bytes, HTTP rejection/acknowledgment,
dedup conflict, media destination safety, single/multi-business routing, retained
bytes and ownership. Automated tests mock HTTP/media/Drive/SQL boundaries.
The development schema and unsigned ngrok connectivity were verified separately
as described above. Signed Lychee events and actual document/Drive import have
not been verified end-to-end. Sending business questions remains absent.
