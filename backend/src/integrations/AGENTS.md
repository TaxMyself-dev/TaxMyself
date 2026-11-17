## Purpose

Owns connected third-party user integrations, currently Composio-managed Gmail
document import/synchronization.

## Key entities/files

- `integrations.controller.ts` exposes authenticated connect, callback, import,
  status and disconnect endpoints.
- `user-integration.entity.ts` and `oauth-state.entity.ts` persist connection
  and short-lived OAuth state.
- `email-connections.service.ts` verifies managed OAuth attempts and handles revocation.
- `composio-client.service.ts` is the explicit-account, read-tool allowlist boundary.
- `providers/email-provider.ts` and `composio-gmail.provider.ts` isolate provider contracts.
- `gmail-reader.service.ts`, `gmail-drive-import.service.ts` and
  `gmail-sync.service.ts` scan, filter, import and track runs.
- `gmail-sync-cron.service.ts` performs scheduled synchronization.

## Main flows

- OAuth state must bind callback to the initiating owner and exact pending account.
  Credentials stay at Composio; never expose SDK state, signed download URLs or raw errors.
- Mailbox endpoints are owner-only; delegated/admin impersonation cannot read mail.
- Keep Composio disabled pending approved live DEV verification. Preserve the separate
  system Drive OAuth credentials. See `docs/features/composio-email.md`.
- Manual/initial/nightly sync share date-range, overlap, concurrency and status
  rules. Imports pass through `DocumentImportService`.
- External OAuth scopes, credentials, provider contracts and live callbacks are
  approval-gated changes.

## Related topics

- `backend/src/document-import/AGENTS.md`
- `backend/src/inbound-email/AGENTS.md`
- `frontend/src/app/pages/settings/AGENTS.md`
