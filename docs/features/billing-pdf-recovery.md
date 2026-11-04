# Captured charge PDF recovery

Current transport (2026-11-02): [Cloud Tasks completion](billing-cloud-tasks.md)
replaces the minute recovery cron, with an authenticated worker and a required
external daily safety-repair invocation. Activation requires dev queue/IAM/Scheduler
configuration and live verification. The minute-sweep descriptions below document
the earlier local commits; they are not the current execution transport.

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

## Existing PDF / failed email follow-up (2026-11-01)

Admin billing → חשבוניות ומיילים ממתינים → locate the payment/renewal event →
שלח חשבונית קיימת במייל → confirm. The backend verifies a saved, issuer-matched
invoice and uses its stored recipient and PDF. No receipt creation, re-signing,
charge, journal or subscription mutation occurs. The original customer-facing
resend endpoint remains unchanged; this is a separately authorized admin action.

Email delivery has its own durable event-metadata lease and retry schedule. The
existing recovery runner handles due failed emails even if the charge attempt is
COMPLETED or absent. Explicit failures use 1/5/15/30-minute then hourly backoff;
crash recovery waits for the five-minute lease plus delay. Old receiptEmail failures
without a schedule are eligible. Success updates receipt_email_sent and receiptEmail
together. No recipient is a recorded skip; an admin can retry after correcting the
existing document through a separately authorized process.

No new polling frequency or Cloud Tasks implementation is introduced. This
extends the existing local recovery implementation, which remains undeployed.
An ambiguous response/crash can duplicate an email; there is no exactly-once claim.

### Manual dev verification (not yet executed)

Use only a separately verified keepintax-dev connection and a test recipient.
Do not boot the full application merely to run these checks.
1. Use an existing dev PAYMENT_SUCCESS / RENEWAL_SUCCESS event linked to an
   existing invoice PDF. Snapshot its document id/count and journal count.
2. Fail the mail adapter after PDF retrieval. Check false sent flags, incremented
   attempts, redacted lastError and future nextAttemptAt. Restore the mock adapter
   and run recovery after the due time: same PDF, sent flags true, no schedule.
3. Repeat with a COMPLETED attempt and with a legacy event without an attempt.
4. Race manual resend with automatic recovery/two instances: only the delivery
   lease owner calls the mail adapter. Kill after claim and verify crash wake-up.
5. Non-admin and wrong issuer/type/attempt/no-PDF inputs must send nothing.
6. Verify zero provider submissions, zero new documents/journals and unchanged
   subscription/obligation state. Actual Brevo inbox-delivery validation remains
   separate from mocked API acceptance.
