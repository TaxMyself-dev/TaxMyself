# Resolve the actual WhatsApp question receipt

- Public docs inspected read-only: https://app.lychee-ltd.com/docs
  (make-send-text) and #action-get-message, 2026-11-01.
- Send documentation returns {ok:true,message_id:<internal UUID>}, not the flat
  WhatsApp identifier assumed by the old adapter. message-get accepts that
  internal message_id. Its response JSON example is not published in the docs.
- Preserve explicit flat WhatsApp receipts; also recognize an explicit message
  object. If send supplies only its documented internal UUID, use one bounded
  authenticated GET message-get lookup. Accept only whatsapp_message_id fields;
  conflicting/missing IDs or ok:false never become document mappings.
- A failed lookup retains the validated internal UUID in safe diagnostic metadata
  for investigation; it never causes another POST. Existing durable outbox and
  receipt-linking behavior is unchanged. Existing quarantined rows untouched.
- Verification uses mocked HTTP only, including flat/nested lookup responses,
  missing/conflicting IDs, HTTP lookup failure, ok:false and no resend. Exact live
  lookup payload shape remains unverified; unrecognized shapes fail closed.
- No real send/lookup tests, DB changes, deployment, integration or push.
- Checks: 25 mocked transport/diagnostic tests, Nest build, and diff whitespace
  checks passed.
