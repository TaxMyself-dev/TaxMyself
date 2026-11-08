# Business-question delivery

Question and result delivery are tested with fake SQL and mock HTTP. Code supports
development and production deployment identities. No live production access,
messages, schema execution, cloud changes, deployment or push are performed by
this implementation. See [production preparation](lychee-production.md).

## Runtime safety

LycheeModule binds both outbound tokens to ConfiguredLycheeTransport. It requires
NODE_ENV=development with keepintax-dev, or NODE_ENV=production with keepintax-prod.
DB_DATABASE, DataSource configuration and actual SELECT DATABASE() must all agree.
Copies, unknown/test/unset runtimes, crossed databases and missing key/channel
configuration block claiming/sending. Before HTTP, verify the request channel and
original quoted message and reject configuration drift during the DB check. No
separate worker enable flag is required.

Only the guarded transport delegates to the unregistered low-level HTTP adapter.
NoSendPromptTransport remains available for offline use; synthetic IDs exist only
in fake SQL tests. Tests mock axios completely. Live deployment remains a separate
operator action, not part of the mocked verification.

## Local use

The existing ignored backend/.env already selects development, has a channel and
API key; no values were copied to Git or changed by this task. Reload/restart the
WhatsApp worktree's normal backend with npm run start:watch and keep ngrok running.
New multi-business documents create drafts; the question worker may send existing
PROMPT_PENDING drafts as well. Earlier preview-only waits without a draft are
still not automatically backfilled.

Local implementation does not update a deployed proxy; operator deployment must
include the signed reply-owner routing supported by the current proxy code.

## Existing-table outbox

waitForBusiness uses one transaction to retain the document metadata/choice snapshot
and insert one stable draft before media download. Bytes are fetched after business
selection; older retained bytes are reused. A lost document lease or conflicting draft
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
guarantee. A stable environment-scoped Idempotency-Key is sent, preserving legacy
development keys; it is not permission to resend UNKNOWN. UNKNOWN without a persisted
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
