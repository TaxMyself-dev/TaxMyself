# Managed Gmail connections through Composio

Status: local implementation plus successful connection-only DEV OAuth/identity verification on 2026-11-18. Message contracts, downloads and import remain unverified live. Do not enable in production on the strength of these limited checks.

## Behavior

New Gmail connections use Composio Managed OAuth via the official `@composio/core` SDK (pinned to 0.29.0). The backend requires Node >=22.22.3; Docker stages now use 22.22.3. No users need a connection migration. The Google account's `sub` identifies one mailbox globally; one owner may hold several mailboxes. The local integration ID and sync history survive reconnects.

`EmailConnectionsService` creates an expiring, single-use database state and binds it to the exact connected-account ID returned by `connectedAccounts.link`. The callback verifies the state, the account in Composio's user-scoped listing, Gmail toolkit, managed auth config, activation and the identity returned by `GMAIL_WHO_AM_I`. Reconnecting a selected row requires the same `sub`. No tokens are saved locally; legacy nullable token columns remain untouched structurally. Retired managed account IDs remain recorded until cleanup succeeds. A failed remote disconnect leaves local access revoked and a visible retry action. Removing an already absent remote connection is idempotent.

Every mailbox endpoint is owner-only, including attachment reads. Accountant and admin impersonation cannot authorize access to a client's mailbox. Provider calls require an ACTIVE local row owned by the user and the explicitly selected connected account. DEV and PROD use separate databases and Composio projects/keys/auth configs. Runtime account context derives its environment from server configuration, not a database column. Composio user IDs remain environment-prefixed hashes of the internal owner ID. SDK results and errors containing signed URLs or credentials never leave the provider boundary.

`EmailProvider` exposes only list, read and download. The SDK boundary allowlists four read tools and always supplies both the internal Composio user ID and connected-account ID. There is no arbitrary tool, proxy, write, delete-mail or send-mail interface for a future agent. Remote deletion of a managed connection is a separate explicit connection-management operation.

Search uses `GMAIL_FETCH_EMAILS` with `ids_only=true`, explicit page size and opaque pagination. Full messages are fetched separately; the bulk detail path can skip failed messages. The adapter requires full MIME payload and preserves nested parts for the existing filename/subject/snippet, image/inline-asset and PDF-content filters. Composio response shapes do not escape the adapter. A downloaded file descriptor is resolved server-side, not returned to the browser/importer.

Downloads require exact configured HTTPS hostnames, public resolved IP addresses, no redirects/proxy/credentials and a bounded 25 MiB stream with a 30-second deadline. Missing/invalid MIME or oversized files fail the scan rather than advancing past unread content. Large-file policy and actual supported provider limits must be validated before enabling live use. No debug attachment copies are written to disk.

Initial, nightly and manual imports claim a database RUNNING marker atomically. Reconnect rejects live runs and uses a conditional connection-pointer update to avoid overwriting concurrent sync state. Existing six-hour stale-marker recovery remains. Any failed message prevents advancing the initial/nightly cursor. Manual scans do not advance it. SHA-256 per-owner/per-business dedup, Drive recovery/compensation and downstream processing stay in `DocumentImportService`.

## Configuration and schema

Start from `backend/.env.composio.example`, keeping secrets in ignored server configuration. Keep `COMPOSIO_EMAIL_ENABLED=false` until a live DEV test is expressly approved. Set separate DEV/PROD projects, keys, auth configs and callback URLs. `COMPOSIO_ENVIRONMENT=dev|prod` is mandatory; a non-production Node environment cannot select prod. The pinned Gmail toolkit version must be an explicit dated version, never latest. Validate the example version against the selected project before live use.

`COMPOSIO_DOWNLOAD_ALLOWED_HOSTS` has no permissive default. Populate exact hostnames only after inspecting an approved DEV file descriptor. Do not store signed URLs in configuration or logs. OAuth callback and frontend-return URLs are server-configured, never accepted from browser redirect parameters.

The schema in `composio-email.sql` (also appended to the repository cutover script) was applied to `keepintax-dev` only on 2026-11-17 with explicit user approval. It adds connection pointer/verification, pending revocation, retired grants and connection-attempt fields: seven columns and one unique index. Environment is not persisted: the deployment selects its separate database and Composio project through server configuration. No production schema or application rows were modified. Keep `DISABLE_SYNCHRONIZE=true`; do not allow automatic TypeORM schema changes. No row or token deletion/backfill is required.

For DEV inspection run `node scripts/apply-composio-dev-schema.cjs` from backend; append `--apply` only with approval to execute missing additive DDL. The script reads the fixed local `.env`, refuses any database name except `keepintax-dev`, verifies `SELECT DATABASE()`, validates existing definitions, and checks for duplicate pointers before creating the unique index. It never imports Nest or contacts providers, prints no credentials, and uses a named maintenance lock plus a bounded metadata-lock wait. DDL implicitly commits in MySQL; rerun inspection after a partial failure rather than assuming rollback. Both tables are preflighted before executing changes.

Google Drive remains direct: service-account folder administration and system-account file operations are separate from client Gmail. Keep `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, the system Drive refresh token and other Drive configuration. Firebase Google sign-in and unrelated OAuth integrations are unchanged.

## Verification

For an expressly approved connection-only DEV check, `node scripts/test-composio-dev-connection.cjs` runs the actual connection services without booting the application, readers, importers or scheduler. It creates a fresh technical DEV identity and a loopback callback on port 4317, permits only GMAIL_WHO_AM_I at the SDK execution boundary, and keeps permanent feature configuration disabled. The consent URL must be completed manually by the user within ten minutes. A successful connection is stored only in the DEV integrations table with initial import incomplete, so it is not eligible for nightly sync. This is a diagnostic, not full application/login UI verification. Do not run it without explicit live-connection approval.

Project key permissions must include Connected accounts Read + Write (link/list), Tools Read, Toolkits Read and Tool execution (Legacy) Write (identity execution). A DEV attempt on 2026-11-17 was blocked before consent because the supplied key had only Connected accounts Read; no mailbox tools ran. Replace that key rather than enabling unrelated permissions.

With a replacement key the 2026-11-18 diagnostic reached ACTIVE managed OAuth and successfully executed identity verification once, but the selected mailbox had a disconnected historical DEV integration owned by a different user. The fresh technical diagnostic identity correctly failed local persistence. Existing revoked rows retain global mailbox ownership and history: use an authorized matching DEV owner context or a clean test mailbox; never delete/reassign the row or weaken ownership checks to force the diagnostic to pass. External connection success and local application activation are separate outcomes.

Only when expressly authorized for that existing DEV owner, run the diagnostic with `--integration-id=<local-id>`. It uses the row's existing owner, requires the same Google identity and compares all sync/history fields after activation. It neither transfers ownership nor resets initial import/cursors. Expired attempts must restart with a fresh consent link; successful Google consent alone is not a completed local callback. Wait for the local page to report successful verification. The harness and OAuth state expire after ten minutes.

The valid existing-owner attempt on 2026-11-18 succeeded: local and Composio statuses ACTIVE, existing user/account/integration identity preserved, all snapshotted history fields unchanged. Exactly one identity verification ran; no message/search/download/import tool ran. Independent status-only verification confirmed the managed account remains active under the correct Composio user/config. The diagnostic listener was stopped, permanent integration enablement remains false, and no app/scheduler was booted. Future mail reads/import require separate explicit approval.

Backend: `npm test -- --runInBand --silent --testPathPattern='integrations|document-import'`, then `npm run build`.

Frontend: `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.email-spec.json --include=src/app/services/integrations.service.spec.ts --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --progress=false`, then `npm run build -- --configuration production`.

The focused frontend config isolates these specs from legacy unrelated specs and supplies the Node declarations used by existing transitive services. The existing frontend lock lacked encoding dependencies; only the two missing package entries were added. No shared node_modules are used. Local Node is 24.13.0; container image construction has not been tested.

All provider tests use synthetic responses. Initial local verification did not boot the application or connect to any database/provider. A subsequent explicitly approved DEV-only schema operation applied two ALTER statements and verified the resulting definitions. No mailbox authorization, provider execution, main integration, push, deployment or production access occurred. Separate live-mail approval remains required for: managed scopes, account activation/revocation, exact MIME/attachmentList shape, WHO_AM_I scope/sub, signed file URL lifetime/hosts/retention, Gmail epoch-date semantics, quota and cost. Interrupted/rejected OAuth flows may leave unused provider-side grants; audit the DEV project's unused attempts during approved live verification. Outlook, agent-branch changes and user-facing filter-rule editing are out of scope.

## Official sources

- [Managed versus custom OAuth](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app)
- [ConnectedAccounts TypeScript SDK](https://docs.composio.dev/reference/sdk-reference/typescript/connected-accounts)
- [Tool execution and version pinning](https://docs.composio.dev/reference/sdk-reference/typescript/tools)
- [Gmail tool catalog](https://docs.composio.dev/toolkits/gmail)

Input/output contracts were also read directly through Composio MCP Search Tools and Get Tool Schemas; no mailbox tools were executed.

## Approved DEV artificial-fixture check — 2026-11-18

The isolated `backend/scripts/test-composio-dev-mail-read.cjs` successfully searched the exact user-prepared subject `KEEPINTAX-DEV-TEST`, read one matching message and downloaded `keepintax-dev-test.pdf` into memory (43,527 bytes, PDF signature verified). Integration 17's entire record, ownership and history were unchanged. No Drive, imports, scheduler, application boot or PROD access occurred. The permanent feature flag remains disabled.

Live testing exposed IPv6-first DNS selection on a machine without working outbound IPv6. The downloader now prefers public IPv4 after checking every resolved address; all existing SSRF and byte-limit protections remain. Focused adapter/downloader tests passed (23 tests), backend build passed. The exact authenticated attachment storage host is allowlisted only inside the diagnostic, not in permanent environment configuration. Full attempt counts, commands, hash and limitations are recorded in the active task notes. This verifies one artificial PDF, not pagination, large files, production readiness or document import.

## Approved normal DEV import — 2026-11-18

The user selected business 5 (נגרות). A single bounded normal manual import through GmailDriveImportService, GmailReaderService and DocumentImportService succeeded: one artificial PDF uploaded to the selected business inbox under the verified KeepInTax-Clients-Dev Drive root; imported_documents row 194 created with source GMAIL. Live Drive parent/size and downloaded SHA-256 verified against the original fixture. No duplicate/retry import was run.

Manual sync status/time fields changed as expected; connection ownership, initial-import history and incremental cursor remained unchanged, as did the business record. The permanent Composio feature flag remains disabled. The diagnostic never started the application, AI or schedulers. User permitted possible processing by another existing DEV AI worker; no claim is made about those separate workers. No PROD, schema changes, main integration, push or deploy. Details and reproducibility guardrails are in the active task notes and `backend/scripts/test-composio-dev-single-import.cjs`.
