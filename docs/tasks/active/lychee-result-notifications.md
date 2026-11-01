# Lychee document result notifications

Scope: implement success/final-failure notifications with mocked tests only.
No real messages, deployment, push, main integration or database execution.

- Commit each terminal document transition and a deterministic `notice:` outbox
  row in one transaction in the existing `lychee_intake_events` table. No schema
  change or TypeORM synchronization. Existing completed documents are not backfilled.
- `IMPORTED` / `ALREADY_IMPORTED` require a Drive file ID, account and business.
  Messages quote the original document and identify the chosen business number.
  Duplicate-file outcomes explicitly say that no extra copy was created.
- `FAILED` only stages a message after five attempts, including an expired fifth
  lease. The text says saving could not be completed; it does not claim that a
  possibly uploaded file is absent. Transient retries and business-selection
  waits do not generate failure messages. No document is re-uploaded by this worker.
- A terminal `REJECTED_BUSINESS` for a verified account stages an immediate
  business-assignment failure notice. Unknown/ambiguous account rejections stay silent.
- Immediate post-commit wakeups plus 10-second polling; SQL leases and immutable
  hashes prevent concurrent workers from sending the same notice normally.
- Revalidate the document result, current unique signup-phone account mapping,
  and any business ownership before sending. Cancel changed/ambiguous recipients.
- `NOTICE_PENDING -> NOTICE_SENDING -> NOTICE_RECORDING -> NOTICE_SENT`.
  `NOTICE_SENT` means provider acceptance with a persisted WhatsApp receipt,
  not confirmed delivery to the phone. Delivery-failure callbacks are a future step.
- Retry receipt persistence only. Recorded receipts recover final status without
  another send. Unknown send results/expired sending leases become `NOTICE_UNKNOWN`;
  never blindly resend. Future live transport must honor the stable outbox ID as
  its idempotency operation key. No live result transport is registered here.
- A separate `LycheeNotificationTransport` is bound to `NoSendNotificationTransport`.
  It blocks sends and even notification claims while offline. Previously authorized
  development business-question delivery remains separately configured.
- Structured `notification.db.document/user/business/receipt/complete`,
  `notification.send/result/preflight/recovery` logs contain static explanations,
  durations, safe error codes/reasons and document event IDs, never message bodies,
  phones, raw provider errors or credentials.

Verification: 135 mocked tests passed across eight suites (notifications, intake,
business questions/transport, webhook, reply diagnostics, immediate scheduling and
timing); backend build and git diff --check passed. No application was started.
Schema/auth/accounting/external-contract/production impact: none. Only existing
SQL queue states and application orchestration change; no credentials are read or
modified and no live services are invoked during verification.
