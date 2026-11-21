# Composio Email — local main integration

Status: COMPLETE for authorized local merge and automated checks. Manual UI verification/configuration and push approval are separate.

## Scope and revisions

User explicitly authorized local main integration and combined tests on 2026-11-21, with no push, deploy or production access. Clean main ea5ba2b30590d7f6ff490d6537addb92740a42b0 merged feature f5f44e454d0c03c65a509630e05074fb067542fb using `git merge --no-ff --no-edit codex/composio-email`. Merge commit: 89277e7cb00096bb83bc6b2b1ef5fbb48ab66753. No conflicts. Reviewed the automatic merges in documents.service.ts and generic-table.component.scss; main's allocation/accounting behavior was preserved and tested explicitly.

## Integrated verification

All application checks below ran in the primary main checkout at 89277e7c, not in the feature worktree:

- `npm ci --no-audit --no-fund` from backend: PASS; exact merged lockfile, 1177 packages, approximately two minutes. No postinstall application hook. Existing deprecation warnings remain. No dependency lock edits or shared node_modules.
- `npm run build` from backend: PASS; Nest compile only, no application bootstrap.
- Focused consolidated Jest: **49 suites / 393 tests PASS**, 352.667 seconds. Same feature coverage as docs/features/gmail-email-main-preparation.md plus documents-draft-issuance.spec.ts, covering main's allocation/deferred issuance change. Exact selection:

      $paths = @(rg --files backend/src/email-intake backend/src/protected-pdf backend/src/document-import -g '*.spec.ts')
      $paths += @('backend/src/documents/email-ai-outcome.spec.ts','backend/src/documents/gmail-document-policy.spec.ts','backend/src/documents/gmail-extraction-prompt.spec.ts','backend/src/documents/documents-inbox-lock.spec.ts','backend/src/documents/documents-inbox-restore.spec.ts','backend/src/documents/inbox-ocr-cron.service.spec.ts','backend/src/documents/document-outcome.spec.ts','backend/src/documents/documents-draft-issuance.spec.ts')
      $paths += @(rg --files backend/src/integrations -g '*.spec.ts')
      $paths += @(rg --files backend/src/reports -g 'report-review*.spec.ts')
      $relative = @($paths | Sort-Object -Unique | ForEach-Object { $_ -replace '^backend[\\/]','' })
      npm --prefix backend test -- --runInBand --silent --runTestsByPath @relative

- `npm run build` from frontend with CI=true and NG_BUILD_MAX_WORKERS=2: PASS; production hash ca0dddb85aeaacaa, 453283 ms. Existing CSS/bundle budget and CommonJS warning categories remain; no thresholds changed. Generic-table styles include the merged status colors; its warning reports 8.00 kB against the unchanged 6.00 kB warning budget.
- ChromeHeadless: **19 tests PASS**, combining the tracked protected-PDF and email spec selections. Command flags: `npm test -- --watch=false --browsers=ChromeHeadless --karma-config=<private-evidence>/main-composio-karma.cjs --ts-config=<private-evidence>/main-composio-frontend.spec.json --include=src/app/services/protected-pdf.service.spec.ts --include=src/app/pages/book-keeping/archived-documents/protected-pdf.spec.ts --include=src/app/services/document-approval-input.spec.ts --include=src/app/services/gmail-sync-state.spec.ts --include=src/app/services/integrations.service.spec.ts --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --progress=false`. The temporary combined config extends main's tsconfig.spec.json, includes exactly those specs and declarations, and uses main's own typeRoots. Temporary Karma config wraps main's existing config with test port 9883. Operator-specific exact paths/commands and raw results remain in private local evidence, outside Git.
- Full-merge diff review found one pre-existing feature-script extra blank line at EOF. Removed only that trailing whitespace and checked `node --check backend/scripts/test-composio-dev-mail-read.cjs`. No application logic changed after the test revision. Final diff/commit whitespace checks pass. No full monorepo test suite is claimed.

Local resource contention was observed (about 1.3GB physical RAM free during simultaneous checks); existing runs were allowed to finish and were not repeated unnecessarily. No test failures occurred in this integrated run. Provider-failure log messages in mocked tests are expected assertions, not live provider calls.

## Boundaries and manual handoff

- No server, scheduler, importer, real AI, Drive deletion, database connection/schema application, production access, deployment or push was started. Main's ignored .env was read only for presence checks and was not modified. Other worktrees/processes were preserved.
- Main's local configuration points to keepintax-dev and PORT=3000. Missing email settings at verification time: COMPOSIO_ENVIRONMENT, COMPOSIO_API_KEY, COMPOSIO_GMAIL_AUTH_CONFIG_ID, COMPOSIO_GMAIL_TOOLKIT_VERSION, COMPOSIO_GMAIL_CALLBACK_URL and COMPOSIO_DOWNLOAD_ALLOWED_HOSTS. Configure the previously validated DEV values before manual Gmail testing; do not copy PROD credentials or overwrite unrelated main settings. No secret values were printed or committed.
- Existing DEV schema authorization/application is recorded in the feature receipts. No PROD schema authorization is implied. The release's always-available workers can resume existing eligible DEV work when the server is deliberately started; automated checks did not start them.
- Final follow-up commit contains this receipt, the preparation-status update and the script EOF cleanup only. All executable application behavior is unchanged from tested merge 89277e7c. Builds/results were not rerun for documentation/whitespace alone.
- Push remains prohibited until Elazar personally tests the current local main and explicitly approves pushing it. No remote refs were changed.