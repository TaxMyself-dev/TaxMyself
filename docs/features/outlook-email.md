# Outlook email through Composio

Implementation branch: `codex/outlook-email`, based on `7b63265d`.

## Behavior

Both Settings screens reuse the email component. Owners can add Outlook accounts,
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

## Prepared schema — application not authorized

On 2026-11-23 Elazar approved preparation only. The standalone script is
`docs/features/outlook-email.sql`; the same statement is appended to cutover.sql
for the repository schema record. Do not execute the cumulative cutover file.
No database was contacted or changed.

The existing durable queue defines email_import_items.message_id as VARCHAR(128).
The prepared ALTER expands it to VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin,
preserving complete, case-sensitive Gmail/Outlook message IDs. The existing
ux_email_item(run_id,message_id,part_path) unique index remains intact without
prefix truncation. Assuming utf8mb4 for the other two fields, its maximum string
payload is 36*4 + 512 + 160*4 = 1296 bytes, below modern InnoDB's 3072-byte limit.
No source-document metadata, accounting schema or application code changed.

Before separately authorized application, inspect the target table's SHOW CREATE
TABLE, column definitions, row format and full unique index. Verify zero existing
message IDs contain non-ASCII characters or exceed 512 characters. This is a
precondition for conversion; no assumption about live data has been verified.
Review deployment locking/DDL behavior for the actual MySQL version. Keep the
original durable CREATE script as the historical baseline and apply the standalone
ALTER afterward on either existing or newly provisioned databases.

Preparation approval does not authorize application in DEV or PROD, live Outlook
intake, main integration, push or deployment. The failed frontend production build
and live provider verification remain outstanding.

## Verification and live limits

Contracts were discovered using Composio tool schemas without reading any mailbox.
Live Microsoft OAuth, personal/organization account behavior, managed scopes, pinned
toolkit responses, download hosts and long-ID persistence still require dedicated DEV
verification after configuration and the approved schema change. No Nest app boot,
database access, mailbox read, AI run, main integration, push or deployment occurred.
Exact automated commands and results are recorded in docs/tasks/active/outlook-email.md.
