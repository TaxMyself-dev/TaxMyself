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
- Optional dialog data `capturedFile` supports home mobile camera capture. On
  initialization it validates an image as JPG/JPEG/PNG up to 10MB, then uploads
  automatically only when a business is already unambiguously selected. Multiple
  businesses require explicit selection and Upload. The photo filename and upload
  status replace the file picker; errors retain the photo for retry. Ordinary
  quick upload and fixed accountant-client business context remain supported.
- Cancel stays enabled during upload and unsubscribes from HttpClient before
  closing; destroying the dialog (including X/mask dismissal) also aborts an
  active request. This cancels the client request, not files already persisted
  in Drive. Upload stays black with its loading spinner; Cancel uses the shared
  white/black-outline style. Both buttons share one two-column row at all widths.

## Related topics

- `backend/src/document-import/AGENTS.md`
- `backend/src/documents/AGENTS.md`
- `frontend/src/app/pages/my-storage/AGENTS.md`
