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
- Gmail integration and nightly eligible-account synchronization are available without feature switches. Preserve the separate system Drive OAuth credentials. See `docs/features/composio-email.md`.
- Manual/initial/nightly sync share date-range, overlap, concurrency and status
  rules. Imports pass through `DocumentImportService`.
- External OAuth scopes, credentials, provider contracts and live callbacks are
  approval-gated changes.

## Related topics

- `backend/src/document-import/AGENTS.md`
- `backend/src/inbound-email/AGENTS.md`
- `frontend/src/app/pages/settings/AGENTS.md`

## Manual Gmail pull date range

The manual pull dialog requires from/to dates shared by selected accounts. Server validation and inclusive-end query construction reuse GmailSyncService initial-import rules (Jan 1 previous year through today in Israel). The API retains its no-date 90-day fallback for existing clients; partial date ranges or combining dates with q are rejected. Initial-import completion and nightly cursor are unchanged.


## Outlook through Composio

Settings now supports Microsoft Outlook alongside Gmail. OAuth state is provider-bound;
the backend validates managed auth config, toolkit, owner, active account and identity.
Read tools are allowlisted separately per toolkit. The persisted provider selects the
reader; date windows, durable runs, owner restrictions and content-hash dedup are shared.
Historical GMAIL source/metadata names identify this shared email pipeline internally.
See `docs/features/outlook-email.md` for configuration and the pending schema gate.
