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
