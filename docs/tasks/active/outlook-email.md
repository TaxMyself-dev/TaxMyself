# Outlook email through Composio

Status: WAITING_FOR_SCHEMA_APPROVAL
Base: 7b63265d; main and origin/main verified equal on 2026-11-23.

Acceptance: owner can connect/reconnect/disconnect Outlook in Settings; Microsoft identity is verified and stored separately from Google; existing manual/initial/nightly durable intake reads Outlook files with fixed date ranges and pagination; Gmail remains compatible.

Plan: provider-aware OAuth/client boundary and Outlook adapter; shared intake and settings; focused backend/frontend regressions and builds; configuration documentation; local commit.

Boundaries: schema preparation approval requested and pending; no schema changes, live mailbox reads, database access, main integration, push or deployment. No accounting/deletion policy changes. Existing GMAIL source names remain internal shared email pipeline identifiers. Provider schemas discovered through Composio only; live OAuth/toolkit configuration remains an operator check.

## Implementation checkpoint

Added owner-only Outlook OAuth/callback, verified Microsoft profile identity, provider-specific managed auth config/tool versions/read-tool allowlists, local/remote disconnect handling, a Microsoft attachment adapter and persisted-provider routing. Settings includes Outlook add/reconnect/disconnect; shared initial/manual/nightly intake accepts Microsoft. Google endpoints remain compatible. Updated topic docs and docs/features/outlook-email.md. No accounting/deletion policy changes.

## Required decision

The existing durable queue uses VARCHAR(128) for message_id and default case-insensitive collation. Microsoft opaque IDs can be longer and case-sensitive. Asked Elazar to approve preparation of a VARCHAR(512) ASCII binary field change without applying it, or choose connect-only scope. No reply yet. No schema/SQL edits performed; do not integrate or enable live Outlook intake on this checkpoint.

## Exact verification evidence

Risk tier: backend service/controller plus frontend service/component behavior. Node 24.13.0, npm 11.6.2. No app boot or live DB/mailbox operation was requested or performed by development commands.

All commands below ran in the respective backend/frontend directory of this feature worktree.

- Backend `npm ci --no-audit --no-fund --prefer-offline`: 1176 packages installed, exit 0. Initial sandbox attempt was denied; an escalated concurrent install failed ENOSPC. Sequential installation succeeded. Backend node_modules was later removed only in this new worktree after backend verification to make room for frontend dependencies.
- Backend `npm test -- --runInBand --silent --testPathPattern='src.integrations|src.email-intake'`: 23 suites, 242 tests, 22 suites/241 tests passed, one changed-code failure in email-intake.store.spec.ts because nullable informational metadata lacked a null guard (66.557 s). Fixed metadata to use optional slice plus null, preserving the existing 64-character informational column. Full IDs remain in durable queue.
- Backend `npm test -- --runInBand --silent --runTestsByPath src/email-intake/email-intake.store.spec.ts`: final corrected code, 1 suite/8 tests passed, exit 0 (16.327 s). Earlier 22-suite evidence is reused for unchanged inputs; this is mixed-revision evidence, not a claimed full passing run on the final revision.
- Backend `npm run build`: passed, exit 0, including a second build after the metadata correction. No remaining backend compile failures.
- Diagnostic selector `npm test -- --runInBand --silent --testPathPattern='outlook|email-connections|composio-client|integrations.controller|gmail-drive-import|gmail-sync.service|user-integrations|composio-gmail'` unintentionally matched the absolute worktree name and selected unrelated suites. Interrupted (exit 1); not reported as a complete pass. Corrected selector above scopes source directories.
- Frontend `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline`: 1512 packages installed independently, exit 0, after ENOSPC failures with concurrent package installs. Existing Node ^20.11.1 declaration warns under Node 24. Failed partial installs created by this task were removed from this worktree only.
- Frontend `$env:CHROME_BIN='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.email-spec.json --include=src/app/services/integrations.service.spec.ts --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --progress=false`: 14 tests passed in Edge 158 headless, exit 0. This covers Gmail compatibility, Outlook request routing, provider-specific reconnect and owner controls. No manual browser OAuth check performed.
- `git diff --check`: passed during review; final result recorded below.

Known baseline test failures: none claimed. Disk exhaustion is an environment failure. Full repository Jest is not required for the changed provider/intake boundary and was not completed. Live OAuth/scopes/configured toolkit version/download-host response verification and long-ID DB persistence remain unexecuted, pending approval/configuration. No main integration, push or deployment.

- Frontend `npm run build -- --configuration production --progress=false`: exit 1, asset-copy stage failed with ENOSPC while copying src/assets/login_el.svg into dist/app/assets/login_el.svg. This is not a passing production build. The build ran concurrently with a final wording-only correction to generic OAuth failure text; no claim is made that the running build included that correction. No broad rerun was performed under exhausted disk conditions.
- Final `git diff --check`: passed, exit 0. File scope reviewed; no environment secrets, dependencies or generated output are included.
- Removed only this task-created worktree dependencies and generated build/cache directories after verification to restore disk capacity. Dependencies must be installed independently again before further verification.

Result: implementation checkpoint only; completion is blocked by pending schema-preparation approval and unsuccessful frontend production build. Live configuration/DEV OAuth verification remains outstanding. No main integration, push or deploy. Do not describe this branch as ready to merge.
