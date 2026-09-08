## Purpose

Uploads supported expense documents into the active business's Drive intake
flow without waiting for email/Gmail import.

## Key entities/files

- `quick-upload-drive-dialog.component.ts` validates selected files, business
  context and upload progress/result.

## Main flows

- Scope every upload to the authenticated active business and preserve the
  shared document-import type/size rules.
- A successful upload places a file in the durable intake flow; it does not by
  itself mean OCR review or expense approval completed.

## Related topics

- `backend/src/document-import/AGENTS.md`
- `backend/src/documents/AGENTS.md`
- `frontend/src/app/pages/my-storage/AGENTS.md`
