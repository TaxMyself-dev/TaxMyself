# Composio Email — preparation for main

Prepared 2026-11-20 on codex/composio-email, following user approval to restore normal ports/search and remove temporary runtime switches. Base checkpoint: 09d07fba. This preparation does not integrate into main, push, deploy, apply schema, start paid processing or modify user data.

## Current behavior

- Frontend npm start uses 4200; development API URL uses localhost:3000. The ignored local backend PORT and callback/return URLs were updated to 3000/4200. The Cloud Run PORT/fallback behavior is unchanged.
- Email connection, durable pull, processing, single-pass AI decisions, confirmed-negative deletion, nightly synchronization, protected-original handling and committed replacement dispatch no longer require activation variables. Normal lifecycle/ownership/concurrency/reference/resource checks remain intact.
- Removed runtime variables: COMPOSIO_EMAIL_ENABLED, GMAIL_NIGHTLY_SYNC_ENABLED, GMAIL_AI_REVIEW_ENABLED, PROTECTED_PDF_ENABLED, PROTECTED_PDF_DISPATCH_ENABLED, GMAIL_DURABLE_INTAKE_ENABLED, GMAIL_DURABLE_SCAN_ENABLED, GMAIL_DURABLE_PROCESS_ENABLED, GMAIL_DURABLE_DELETE_ENABLED, INBOX_OCR_ENABLED, GMAIL_DURABLE_ALLOWED_INTEGRATION_IDS, GMAIL_DURABLE_REQUIRED_BUSINESS_NUMBER and GMAIL_DURABLE_DEV_TEST_SUBJECT. They are absent from runtime source, current environment examples and the ignored local environment. Historical verification receipts may still quote the settings used then.
- The subject KEEPINTAX-DEV-UI-20261120-B1 is no longer injected. Manual pull freezes the normal 90-day attachment query unless the caller supplies a fixed query. Initial import uses its validated date range. Existing historical run queries remain immutable audit history.
- Gmail synchronization stays scheduled at 02:00 Israel time and considers only eligible connected accounts with completed initial import. Durable processing scans due records every five seconds, protected delivery every thirty seconds and existing generic INBOX OCR on its existing schedule. Workers continue persisted eligible work at startup; they are no longer artificial-only.
- Explicit valid non-accounting decisions can delete managed Drive files, after identity/reference checks and acknowledgement. Empty/uncertain/invalid responses and locked PDFs remain ineligible. Gmail originals remain untouched. User accounting approval remains required.
- COMPOSIO_ENVIRONMENT, separate DEV/PROD projects/keys/databases, account membership checks and read-tool allowlists remain mandatory. DISABLE_SYNCHRONIZE=true and SKIP_BOOT_SEED=true were retained locally. These are schema/startup safeguards, not feature rollout switches.

## JPEG PDF correction

The old pdf.js 1.10 native JPEG path calls browser Image, then crashes the isolated child even after a readable IPC response. The parent correctly treats that exit as failure, but this falsely blocked valid JPEG-containing PDFs. Inspection now supplies nativeImageDecoderSupport=NativeImageDecoding.NONE, using the installed parser's non-browser decoding path. No dependency or Node upgrade was introduced.

A real generated JPEG PDF test covers inspection and text extraction. Existing malformed-file, later-page damage, limits, password and host-crash containment checks remain. The compiled parser also read all five locally saved previously blocked samples (2/2/4/2/2 pages). Those existing records were not reset or reprocessed, and the remaining 27 blocked files were not individually revalidated. No AI was used for this diagnosis/check.

## Verification

Final consolidated backend: **48 suites / 390 tests PASS**, 90.76 seconds. From feature root, PowerShell:

    $qaPaths = @(rg --files backend/src/email-intake backend/src/protected-pdf backend/src/document-import -g '*.spec.ts')
    $qaPaths += @('backend/src/documents/email-ai-outcome.spec.ts','backend/src/documents/gmail-document-policy.spec.ts','backend/src/documents/gmail-extraction-prompt.spec.ts','backend/src/documents/documents-inbox-lock.spec.ts','backend/src/documents/documents-inbox-restore.spec.ts','backend/src/documents/inbox-ocr-cron.service.spec.ts','backend/src/documents/document-outcome.spec.ts')
    $qaPaths += @(rg --files backend/src/integrations -g '*.spec.ts')
    $qaPaths += @(rg --files backend/src/reports -g 'report-review*.spec.ts')
    $relative = @($qaPaths | Sort-Object -Unique | ForEach-Object { $_ -replace '^backend[\\/]','' })
    npm --prefix backend test -- --runInBand --silent --runTestsByPath @relative

Backend build: `npm --prefix backend run build` PASS. No application/scheduler bootstrap.

Frontend production build: `npm run build` from frontend with CI=true and NG_BUILD_MAX_WORKERS=2 PASS, hash b38b7ed11254f588. CI uses the existing Angular cache policy to avoid a persistent cache expansion. Existing CSS/bundle budget and CommonJS dependency warnings remain; no thresholds were changed. The build reported an unusually inflated elapsed value; it is not used as application performance evidence.

Frontend: **13 tests PASS** in ChromeHeadless. From frontend:

    npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.protected-pdf-spec.json --include=src/app/services/protected-pdf.service.spec.ts --include=src/app/pages/book-keeping/archived-documents/protected-pdf.spec.ts --include=src/app/services/document-approval-input.spec.ts --include=src/app/services/gmail-sync-state.spec.ts --progress=false

The executed command additionally used a temporary external Karma configuration setting test port 9882, and the existing local CHROME_BIN, to avoid other worktree test ports. This changes no tracked app configuration. Chrome cleanup emitted its launcher SIGKILL warning after all 13 passed.

Diagnostics: obsolete disabled-path/legacy keyword-only expectations and missing mocked PDF validation/AI stop reason were inspected and corrected to the requested always-available behavior. A transient EACCES in the unchanged localhost HTTP crash test passed on rerun and in the final consolidated run. An unsupported ng test --port option failed before tests; it was replaced by the temporary Karma configuration. Earlier failed checkpoints are not reported as passing. One prior diagnostic run also reported an inflated elapsed duration; no statistical/throughput claims are made. No snapshots, acceptance thresholds or security criteria were weakened. No full monorepo suite is claimed.

The five-sample parser check performed only local reads; no database update, import, real AI or deletion occurred in this preparation. `node --check backend/scripts/qa/gmail-intake-live-dev-check.cjs`, runtime-switch searches and `git diff --check` passed. Secrets/local evidence/build outputs remain outside Git.

## Runtime handoff and approval gates

The owned Composio Email frontend 4202 and backend 3002 were stopped before changing their URLs, avoiding cross-calls into another checkout. Ports 4200 and 3000 currently belong to the separate auto-classification worktree; it was not stopped, reconfigured or replaced. This feature was NOT launched on those occupied ports. Launch it only after deliberately freeing them, using its own ignored DEV configuration.

Apply/preflight the reviewed Composio, durable-intake and protected-PDF schema in each target environment before starting this release; DEV's earlier approved schema application does not authorize production. No SQL was applied here. Existing blocked rows are retained; the earlier user-authorized cleanup is recorded separately.

Local main integration still requires explicit approval. After approved integration, Elazar must personally test the current main revision and explicitly approve any push. No main integration, remote push, deploy or production action was performed by this preparation.