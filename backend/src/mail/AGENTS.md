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
No dependencies on other backend topics (reads only `BREVO_API_KEY`/`BREVO_SENDER` env vars). Consumed by: documents, billing, delegation (each injects `MailService` to send notifications/receipts/invites).
