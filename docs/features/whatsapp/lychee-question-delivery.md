# Business-question delivery checkpoint (offline only)

Question delivery is implemented and tested with fake SQL and mock transports.
No live messages, DB writes, migrations, deployments or pushes were performed.
Success/failure confirmations remain out of scope.

## Runtime safety

LycheeModule binds LycheePromptTransport exclusively to NoSendPromptTransport.
The question worker exits before claiming when this transport is unavailable.
No environment variable/API key enables it. There are no simulation endpoints
or generated provider IDs in the running application. Synthetic IDs exist only
in tests using fake storage.

LycheeHttpPromptTransport implements the documented make-send-text contract but
is NOT registered in the application. Its tests mock axios completely. Real
activation requires separate user authorization, a reviewed provider binding,
credential scopes and a live verification plan.

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
