# Outlook email through Composio

Implementation branch: `codex/outlook-email`, based on `7b63265d`.

## Behavior

Both Settings screens reuse the email component. The section heading is
"חבר את תיבת המייל שלך לטובת משיכת מסמכים". Both Outlook add-account buttons
show the local decorative Outlook SVG through the existing button icon input.
Owners can add Outlook accounts,
reconnect the exact selected Microsoft account, disconnect and retry remote revocation.
The callback success flag only triggers a refresh; backend-verified state is authoritative.
Google and Microsoft remain distinct persisted providers. Delegation and admin
impersonation cannot connect or read mailboxes.

The Outlook adapter uses the existing initial, manual and nightly intake. Shared fixed
date queries become receivedDateTime OData filters across all folders, with exclusive
upper bounds and opaque continuation tokens. It does not use Graph hasAttachments,
which omits messages with inline files only. Unsupported arbitrary Gmail queries fail
closed. File attachments use the existing bounded signed-download service; embedded
items and linked files are excluded. Unpageable attachment lists fail instead of
silently completing an incomplete scan. Attachment IDs are sorted before MIME paths
are assigned so provider ordering does not change stored part paths.

The existing GMAIL document source, metadata names, processing policy and source
labels remain historical internal shared-email identifiers. No new accounting or
deletion behavior. Informational document message metadata is limited to its existing
64-character column; full message IDs must remain intact in the durable scan queue.

## Configuration

In the application's own Composio project/environment, configure a managed Outlook
OAuth auth config with read access (User.Read, Mail.Read and offline_access), then set:

- COMPOSIO_OUTLOOK_AUTH_CONFIG_ID
- COMPOSIO_OUTLOOK_TOOLKIT_VERSION: an explicitly verified pinned toolkit version
- COMPOSIO_OUTLOOK_CALLBACK_URL: backend `/integrations/outlook/callback`
- OUTLOOK_FRONTEND_URL: Settings return URL (GMAIL_FRONTEND_URL is the fallback)

The existing COMPOSIO_API_KEY/environment and download hostname allowlist are reused.
No credentials or new auth configs were created or changed during development.
Connecting Outlook to this chat's Composio connector does not configure the application.

Outlook read allowlist: GET_PROFILE, LIST_MESSAGES, GET_MESSAGE,
LIST_OUTLOOK_ATTACHMENTS and DOWNLOAD_OUTLOOK_ATTACHMENT (all OUTLOOK-prefixed).
Every SDK execution uses the explicit connected account and authenticated `me`.

Existing Google URLs remain compatible. Shared status/import URLs retain their historic
`google/gmail` names and now operate on owner-scoped supported email providers.
New URLs: GET outlook/connect, GET outlook/callback, DELETE email/:integrationId,
under `/integrations`.

## DEV schema applied; production unchanged

Elazar approved DEV-only application on 2026-11-23 after preparation approval.
`node scripts/apply-outlook-dev-schema.cjs` inspected fixed local DEV settings,
runtime DATABASE(), data encoding/length, full unique index and InnoDB row format.
`node scripts/apply-outlook-dev-schema.cjs --apply` applied exactly one ALTER on
keepintax-dev (MySQL 8.0.37-google). Before/after count: 408 rows; no non-ASCII or
overlength IDs. Verified message_id VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin
NOT NULL, full unique index retained, 1296-byte maximum string key payload, plan [].
A later read-only inspection also returned plan [] with 410 rows: DEV has concurrent
activity. The schema helper performed no INSERT/UPDATE/DELETE or application boot.

Standalone SQL: docs/features/outlook-email.sql. The cumulative cutover copy is a
record only, not an application command. PROD application remains unauthorized.
The helper defaults to inspection, hardcodes keepintax-dev, checks live metadata and
data before conversion, uses a maintenance lock and bounded metadata-lock wait,
and checks post-application state. Six offline guard tests cover identity refusal,
lossless conversion preconditions, index shape and idempotency.

## DEV Composio configuration and connection test

The user-supplied Outlook auth config is saved only in this worktree's ignored
backend/.env. The five allowlisted tool schemas all resolved to pinned version
20261120_00 using the application's existing Composio DEV key.
`node scripts/configure-outlook-dev.cjs --auth-config-id=ac_<id>` validates the
config when management access is available and writes only the four Outlook
settings locally. Auth-config metadata reads still return HTTP 403 under the
current key, so scopes/managed status cannot be independently confirmed yet.
No auth-config credentials or scopes were changed through the API.

Local app return configuration: backend Outlook callback on localhost:3002,
frontend return on localhost:4202. These are feature-worktree destinations, not
changes to main. No app servers were started or frontend API destination changed.
Configure the feature frontend to use its own backend before a full manual UI run.

`node scripts/test-outlook-dev-connection.cjs` starts an isolated loopback listener
on 127.0.0.1:4318, overriding the callback only in that diagnostic process. It
creates an OAuth attempt under a new technical DEV owner, loads only integration
repositories/services, disables synchronize/migrations and blocks every SDK tool
except OUTLOOK_GET_PROFILE. Connection deletion is also blocked. The provider
accepted creation of a hosted link for the supplied auth config. Microsoft consent
and a successful callback remain pending; link creation is not active connection
verification. No messages, attachments, imports, AI or schedulers were executed.

## Verification and live limits

Contracts were discovered using Composio tool schemas without reading any mailbox.
Live Microsoft OAuth, personal/organization account behavior, managed scopes, pinned
toolkit responses, download hosts and long-ID persistence still require dedicated DEV
verification after user consent. DEV schema/configuration operations above are approved.
No Nest app boot, mailbox read, AI run, main integration, push or deployment occurred.
Exact automated commands and results are recorded in docs/tasks/active/outlook-email.md.
