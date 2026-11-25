## Purpose
Sends transactional email (plain or with a PDF attachment) via the Brevo (Sendinblue) API. Used wherever another module needs to email a user — reports, receipts, invitations.

## Key entities/files
- `mail.service.ts` — `MailService`: wraps `sib-api-v3-sdk`'s `TransactionalEmailsApi`. `sendMail(to, subject, text, htmlContent?)` for plain/HTML email; `sendMailWithAttachment(to, subject, text, attachmentBuffer, attachmentName, attachmentContentType?)` for email with a base64-encoded attachment (wraps `text` in an RTL Hebrew HTML template).
- `mail.controller.ts` — `@Controller('mail')` stub with no routes; exists only so Nest wires the module.
- `mail.module.ts` — provides and exports `MailService`.

## Main flows
- `sendMail` — plain transactional email via Brevo, sender fixed to `process.env.BREVO_SENDER`.
- `sendMailWithAttachment` — same, plus a base64 PDF/file attachment; builds an RTL-styled HTML body from a plain-text message. Errors are logged with Brevo-specific diagnostics (401/IP-whitelist hints) and rethrown.

## Related topics
No dependencies on other backend topics (reads only `BREVO_API_KEY`/`BREVO_SENDER` env vars). Consumed by: documents, billing, delegation (each injects `MailService` to send notifications/receipts/invites), and Feezback (best-effort provider-duplicate operational alerts containing transient response timestamps).

## Queued document attachments

`sendMailWithAttachment` accepts optional `{ timeoutMs, sanitizedLogs }` after
the existing content-type argument. Outbox sends use a separate SDK client with
a 30-second request timeout and suppress content/provider-detail logs. Other
callers keep the existing client/settings. Delivery status/retries belong to
`documents/document-email-queue.service.ts`, not the mail wrapper; ambiguous
outcomes must not be automatically resent. See
[document generation](../../../docs/features/document-generation-speed.md).
