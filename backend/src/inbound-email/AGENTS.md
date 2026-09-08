## Purpose

Receives Mailgun attachments for stable per-business email aliases and handles
Gmail forwarding-verification messages safely.

## Key entities/files

- `inbound-email-address.service.ts` allocates and resolves permanent aliases.
- `mailgun-inbound.controller.ts` verifies, resolves, filters and imports the
  multipart webhook.
- `mailgun-signature.service.ts` validates signature and timestamp.
- `gmail-forwarding-verification.service.ts` extracts only recognized Google
  confirmation URLs for relay.

## Main flows

- Unknown/inactive recipients are rejected; supported attachments pass to
  `DocumentImportService` and inherit its dedup rules.
- Aliases are global and case-insensitive. Never recycle a released alias to a
  different business.
- Never log message bodies, signatures, tokens or attachment contents.
- Route/domain/provider changes are external-service changes and require the
  approval defined in `docs/coordination/AUTHORITY.md`.

## Related topics

- `docs/features/inbound-email.md`
- `backend/src/document-import/AGENTS.md`
- `backend/src/mail/AGENTS.md`
