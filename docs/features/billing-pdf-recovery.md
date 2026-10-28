# Captured charge PDF recovery

## Behavior

A captured charge can have a committed invoice but no PDF after a timeout.
Completion is now swept every minute independently of the daily renewal selector.
The sweep selects up to 20 due CHARGE/CAPTURED attempts, with no live lease and
at least one minute since capture. Old captures with a null next_action_at are
included. Refunds and uncertain provider outcomes use their separate workflows.

Token captures resume completeCapturedAttempt; hosted captures resume hosted
completion, retaining its activation and ownership guards. Neither path submits
a new charge. An operator can still use the existing COMPLETE_CAPTURED action
on an unresolved attempt; it uses the same exclusive finalization lease.

Before PDF/signing/upload, the canonical invoice is linked to both its success
event and billing attempt. Attempt provenance must match the document. A failure
keeps CAPTURED and the existing invoice, its original number and journal entry.
Retries reuse that invoice and its PDFs, and skip mail already marked sent.
An explicit mail delivery error keeps completion pending too. Missing recipient
email retains the existing skip behavior.

After each failed run the delay is 1, 5, 15, 30 minutes, then one hour for each
subsequent run. These are delays between executions, not offsets from capture;
the minute sweep and queue volume add latency. A claim persists a crash wake-up
after the five-minute lease plus the current delay, so a process that dies without
releasing its lease remains discoverable. Manual and daily completion may retry
earlier than the automatic schedule, still under the same lease. Automatic claims
recheck next_action_at under the row lock, so a stale candidate from another
instance cannot bypass a retry delay just saved by the first instance.

No schema migration is required. Existing next_action_at stores the wake-up.
failure_category stores POST_CAPTURE:<sanitized category>:<run count>, including
IN_PROGRESS while claimed. Provider response data, transaction id and provider
reconciliation counters are unchanged. Successful completion clears the tag and
schedule and settles the existing attempt/debt through the canonical finalizer.

## Scope and limits

This fixes completion of canonical captured attempts; it does not reconstruct
deleted historical invoices or backfill legacy events without billing_attempt.
It does not diagnose or change the underlying PDF renderer timeout. Activation
states requiring operator review remain pending under existing guards.
Delivery still uses the existing mail API: an ambiguous delivery outcome can
cause a repeated email; no provider mail idempotency contract is introduced.
No new email/admin alert transport or UI is introduced; pending attempts remain
in the existing admin unresolved-attempt workflow and emit categorized logs.
The sweep requires a running backend instance with Nest cron scheduling active.

## Manual verification in development

1. Use only keepintax-dev with test provider settings. Simulate a PDF timeout
   after a captured test charge has created its canonical invoice.
2. Confirm CAPTURED, unchanged CardCom transaction id, the same receipt_doc_id
   on event and attempt, a POST_CAPTURE:RECEIPT_STEP_FAILED tag and next_action_at.
3. Restore PDF generation and wait for the next due sweep. Confirm the same
   invoice receives file/copyFile, mail is sent, attempt becomes COMPLETED,
   debt becomes SATISFIED and next_action_at/failure_category are cleared.
4. Confirm no additional CardCom charge, success event, document or journal
   entry. Repeat with concurrent admin completion and with a stopped process;
   a live lease must exclude concurrent work, and an expired claim must recover.

Production was not accessed, changed or deployed as part of this implementation.
