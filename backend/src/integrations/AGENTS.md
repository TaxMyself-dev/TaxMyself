## Purpose

Owns connected third-party user integrations, currently Google OAuth and Gmail
document import/synchronization.

## Key entities/files

- `integrations.controller.ts` exposes authenticated connect, callback, import,
  status and disconnect endpoints.
- `user-integration.entity.ts` and `oauth-state.entity.ts` persist connection
  and short-lived OAuth state.
- `google-oauth.service.ts` exchanges/refreshes tokens.
- `gmail-reader.service.ts`, `gmail-drive-import.service.ts` and
  `gmail-sync.service.ts` scan, filter, import and track runs.
- `gmail-sync-cron.service.ts` performs scheduled synchronization.

## Main flows

- OAuth state must bind callback to the initiating authenticated user. Tokens
  stay server-side and encrypted; never place them in URLs or logs.
- Manual/initial/nightly sync share date-range, overlap, concurrency and status
  rules. Imports pass through `DocumentImportService`.
- External OAuth scopes, credentials, provider contracts and live callbacks are
  approval-gated changes.

## Related topics

- `backend/src/document-import/AGENTS.md`
- `backend/src/inbound-email/AGENTS.md`
- `frontend/src/app/pages/settings/AGENTS.md`
