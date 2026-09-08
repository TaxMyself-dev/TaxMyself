## Purpose

Common ingestion boundary that validates and deduplicates document attachments
before storing them in the correct business Drive inbox.

## Key entities/files

- `document-import.service.ts` validates ownership, MIME/type, size, hash and
  destination, then writes through `GoogleDriveService`.
- `entities/imported-document.entity.ts` records source, content hash, Drive
  identity and import metadata.
- `enums/document-import.enums.ts` defines intake sources such as Gmail and
  email forwarding.

## Main flows

- Gmail and Mailgun callers converge here; keep dedup semantics consistent
  across channels.
- On a database failure after a Drive upload, cleanup attempts to remove the
  orphaned file. Preserve this compensation behavior.
- Scope every lookup to the authenticated user and business.

## Related topics

- `backend/src/inbound-email/AGENTS.md`
- `backend/src/integrations/AGENTS.md`
- `backend/src/google-drive/AGENTS.md`
- `backend/src/documents/AGENTS.md`
