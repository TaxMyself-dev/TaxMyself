# WhatsApp intake

## Lychee adapter (2026-10-25)

Approved owner mapping for this adapter is the signup phone (normalized), with
ambiguous or unknown accounts rejected. This overrides the simulator-only rule
below for Lychee. Every import requires an explicit currently owned business.
POST /webhooks/lychee validates raw HMAC and channel before durable enqueue.
Provider sender_phone may be null, missing or blank: use normalized contact_phone
in that case. A malformed or conflicting nonempty sender must still be rejected.
LycheeEventStore uses explicit SQL; its table MUST NOT join TypeORM synchronize.
Elazar approved preparing its SQL only; no database execution was authorized.
The receiver loads with normal backend startup; no intake enable flag is needed.
The document worker runs automatically on the normal scheduler. Multi-business
documents remain WAITING_FOR_BUSINESS. Bytes and one prompt: outbox draft are
staged transactionally in the existing table. User authorized development-only
question sends: DevelopmentOnlyPromptTransport requires NODE_ENV=development,
actual DataSource/connection database keepintax-dev and configured key/channel.
It alone wraps the HTTP adapter. Production sends remain unauthorized/blocked.
Tests mock HTTP; NoSendPromptTransport remains for offline use. Provider receipts live
in outbox JSON; only the document gets prompt_whatsapp_message_id. UNKNOWN sends
must not be retried blindly; persisted receipts retry linking only. Never invent
provider IDs or route to a primary business. Tests use fake IDs in fake SQL only.
Signed POST /webhooks/lychee/reply-owner is read-only and queries persistent
document prompt ownership (including completed rows). It must not enqueue or
call selectBusiness. recordPrompt binds real provider IDs for a future sender.

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
