# Prefer provider-confirmed waId receipts

- User relayed Lychee confirmation: send.messageId is internal, send.waId is the
  WhatsApp message ID matched by reply_to_whatsapp_message_id. This supersedes
  earlier uncertainty about waId recorded in receipt investigation tasks.
- Valid send.waId is primary; it skips message-get. Existing explicit WhatsApp
  receipt aliases remain supported, and message-get remains fallback when no
  usable direct receipt exists. Read lookup retains channel/identity validation;
  waId is not treated as a documented field of arbitrary read responses.
- Reject ok:false, malformed IDs and unusable ambiguous fallback references.
  Preserve existing idempotency, receipt persistence and quarantine behavior.
- Tests mock HTTP and SQL only; existing rows not edited/requeued and no live
  question sent. No deployment, main integration or remote push.
- Verification: 59 mocked transport/outbox tests passed, including primary waId
  precedence, malformed/missing waId fallback, failed responses and unchanged
  no-resend behavior. Backend build and diff checks passed.
