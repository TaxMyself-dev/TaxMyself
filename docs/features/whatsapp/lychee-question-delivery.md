# Business-question delivery (development activation)

Question delivery is tested with fake SQL and mock HTTP. The user subsequently
authorized live business questions in development only. No manual live question,
schema change, deployment or push was performed as part of activation. Success/
failure confirmations remain out of scope.

## Runtime safety

LycheeModule binds LycheePromptTransport to DevelopmentOnlyPromptTransport.
It is available ONLY with NODE_ENV=development, the actual DataSource configured
for keepintax-dev, and LYCHEE_API_KEY/LYCHEE_CHANNEL_ID configured. Other database
names (including production copies), production/test/unset NODE_ENV, or missing
configuration block claiming and sending. Before each send, verify the request's
channel and original quoted message, and SELECT DATABASE() on the active pool.
It must return keepintax-dev. Generic DB_DATABASE from env is not a substitute
for either check. No separate worker enable flag is required.

Only the guarded transport delegates to the unregistered low-level HTTP adapter.
NoSendPromptTransport remains available for offline use; synthetic IDs exist only
in fake SQL tests. Tests mock axios completely. Production activation remains
unauthorized and blocked by code.

## Local use

The existing ignored backend/.env already selects development, has a channel and
API key; no values were copied to Git or changed by this task. Reload/restart the
WhatsApp worktree's normal backend with npm run start:watch and keep ngrok running.
New multi-business documents create drafts; the question worker may send existing
PROMPT_PENDING drafts as well. Earlier preview-only waits without a draft are
still not automatically backfilled.

The dev quoted-reply proxy changes are on the feature branch only until a later
authorized integration/deployment. Enabling local sends does not update the
deployed proxy; full phone-button testing still needs that routing revision.

## Existing-table outbox

waitForBusiness uses one transaction to retain document bytes/choice snapshot and
insert one stable draft. A lost document lease or conflicting existing draft
rolls back both operations. No schema change: the existing intake table holds
metadata-only question rows under prompt: + SHA-256(channel, document event).
These statuses never enter the document worker's PENDING/RETRY/PROCESSING flow.

Draft hashes use canonical JSON, tolerating MySQL JSON key reordering. Labels,
recipient, choices and quoted document are snapshotted rather than regenerated.

| Status | Meaning |
| --- | --- |
| PROMPT_PENDING | Draft stored, no confirmed external attempt |
| PROMPT_SENDING | Worker owns the one automatic attempt |
| PROMPT_LINKING | Receipt persisted; only mapping may proceed |
| PROMPT_LINK | Mapping retry scheduled; no new send |
| PROMPT_SENT | Provider ID linked to source document |
| PROMPT_UNKNOWN | Unknown external outcome; automatic sending stops |
| PROMPT_CANCELLED | Owner/document/snapshot/mapping conflict; sending stops |

The receipt lives in outbox payload.providerMessageId, NOT its indexed
prompt_whatsapp_message_id column. Only the original document owns that column,
so dev SQL reply routing cannot mistake two rows for two owners.

## Recovery / duplicate prevention

- Atomic five-minute leases exclude concurrent workers. Before sending, recheck
  the user phone, current business ownership, snapshot and document quote.
- HTTP has no retry loop. Persist the returned WhatsApp ID first, then link it
  to the document/channel/account via the idempotent recordPrompt method.
- A transient receipt-write failure retries saving the SAME ID once, never HTTP.
- Mapping/completion failures retry linking after 60 seconds, including restart
  or a document advancing after mapping. Conflicting IDs are never overwritten.
- Expired sending leases and uncertain HTTP results become PROMPT_UNKNOWN and
  are not blindly resent. If SQL committed a receipt despite lost acknowledgements,
  recovery resumes linking. Expired linking leases resume linking only.

This is at-most-one automatic external attempt, NOT a provider exactly-once
guarantee. Provider idempotency is not established. UNKNOWN without a persisted
receipt needs provider-side reconciliation before an operator authorizes further
action. No automatic reconciliation/resend or operator UI exists here.

Earlier preview-only WAITING_FOR_BUSINESS rows have no outbox entry. They are
not silently backfilled/sent; review those before future live activation. New
multi-business waits stage their draft transactionally.

## Verification / operations

Offline tests cover rollback, stable drafts, concurrent claims, lost acknowledgements,
receipt/mapping failures, restarts, revoked ownership, JSON reordering and two
documents answered out of order. Real MySQL concurrency/provider delivery are not
claimed by these tests.

Logs use business.prompt.queued/send/link/claim with safe fixed messages, without
recipients, business names, credentials or provider response bodies. To inspect
development metadata manually (not executed during implementation):

```sql
SELECT event_id, status, attempts, last_error, created_at, updated_at
FROM lychee_intake_events
WHERE status LIKE 'PROMPT_%'
ORDER BY created_at DESC
LIMIT 50;
```

Known dev replies still resolve from dev SQL, independently of a production
backend. This checkpoint does not merge or deploy that proxy change.
