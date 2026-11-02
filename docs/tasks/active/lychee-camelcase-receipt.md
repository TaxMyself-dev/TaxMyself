# Resolve observed camelCase send references

- Public send docs do not document messageId/waId (inspected 2026-11-01). No
  authoritative meaning for waId was established; never use it as a receipt or
  infer its role from its name. No new send was made to inspect response values.
- Read-only investigation: inspected an already received local ngrok event and
  its existing Lychee GET message-get record. Confirmed flat message_id (UUID,
  matched the webhook), whatsapp_message_id (wamid), and channel_id fields.
  Only schema and comparison booleans were printed, not credentials/content.
- Earlier guarded dev SQL inspection could not proceed because gcloud credentials
  required authentication. No database writes or production access occurred.
- Accept messageId as a reference to resolve, not a directly trusted WhatsApp ID.
  UUID references use message_id; other bounded identifiers use the documented
  whatsapp_message_id lookup parameter. Returned canonical ID must match the
  requested identity and channel. Conflicting aliases fail closed. waId ignored.
- Mocked tests cover both namespaces, conflicting aliases, wrong channel/identity,
  ignored waId and single POST only. Existing quarantined questions untouched.
- No real send, resend, requeue, deployment, main integration or remote push.
- Verification: 35 mocked transport/schema/privacy tests, backend build and diff
  checks passed. Actual read-only message-get response shape was verified using
  an existing incoming message, not a newly sent question.
