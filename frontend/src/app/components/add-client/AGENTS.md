## Purpose

Creates and edits a business customer's document-issuance contact record.

## Key entities/files

- `add-client.component.ts` owns the dynamic form, duplicate confirmation and
  dialog result.
- `add-client.service.ts` calls the client endpoints.

## Main flows

- Create and edit use the same normalized customer fields; preserve the stable
  record id during updates.
- A suspected duplicate requires explicit confirmation before the retry.

## Related topics

- `backend/src/clients/AGENTS.md`
- `frontend/src/app/pages/doc-create/AGENTS.md`

## Edit-mode save rules

- The clients page passes the original server record (not the table's `-`
  display row) to the dialog, so missing optional fields stay empty.
- In edit mode the save button (`canSave`) requires a valid form and a real
  change versus the loaded values (trimmed; `''`/`null`/`undefined` equal).
  `saveClient` repeats this guard. Create mode only requires a valid form.

## Phone validation

- `phone` is optional; when filled it must match
  `/^0(?:[23489]\d{7}|[57]\d{8})$/` (02/03/04/08/09 → 9 digits; 05/07 → 10
  digits). Digits only: hyphens, spaces, letters and `+972` are rejected, never
  auto-cleaned. Service numbers and international numbers are unsupported.
- The message comes from the field's `errorText` (`IBaseFieldData`) and is
  forwarded to `app-input-text` in the template.
