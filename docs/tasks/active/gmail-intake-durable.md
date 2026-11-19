# Durable Gmail intake implementation

Status: IMPLEMENTED; offline verification complete; final checkpoint results are recorded below. Runtime activation and schema application require separate approval.

## Scope and revision

Existing codex/composio-email worktree, base 7ae55357, initially clean. No other worktree changed. Acceptance: persisted pagination/resume; bounded processing without total ambiguous quota; six-type single-pass AI; ordinary pending approval with nullable metadata; strict exact-file deletion and scoped tombstones; existing archive and persistent run counts; default-off compatibility with unapplied schema.

No database was connected, no schema applied, no Nest server started, no real import/AI/Drive mutation/deletion executed. Actual ignored backend/.env unchanged. No dependencies upgraded. No PROD, main integration, push or deployment.

## Milestones completed

1. Six-type strict policy/response contract, legacy compatibility and policy tests.
2. Prepared two-table run/item schema plus nullable/reservation/work/decision columns on existing imported_documents; SQL appended once to cutover.sql, unapplied.
3. Durable scan pages and MIME identities, scoped hash dedup, staging registration/tag recovery, distributed scan lock, bounded retries and restart simulation with 300 attachments.
4. Existing extraction/catalog/normalizer reused in durable worker; saved response reuse, unknown in-flight call becomes manual pending without paid replay; exact-file delete/reference/owner guards and acknowledged deletion/tombstones.
5. Existing archive/approval and Gmail settings UI: six type labels, genuinely empty amount/date inputs, server-side approval validation, separate pull/processing summaries and polling. Protected replacements reserve management before the INBOX move.

Implementation and operational limits: docs/features/gmail-intake-durable.md. Prepared SQL: docs/features/gmail-intake-durable.sql. New flags example: backend/.env.gmail-durable.example (all false).

## Executed verification

Backend broad focused checkpoint: 30 suites / 215 tests PASS, 147.716 seconds. Exact PowerShell command (paths discovered at execution, no missing paths):

    $paths = @(rg --files backend/src/email-intake -g '*.spec.ts'); $paths += @('backend/src/documents/gmail-document-policy.spec.ts','backend/src/documents/email-ai-outcome.spec.ts','backend/src/documents/documents-inbox-restore.spec.ts','backend/src/documents/documents-inbox-lock.spec.ts'); $paths += @(rg --files backend/src/protected-pdf -g '*.spec.ts'); $paths += @(rg --files backend/src/integrations/services -g 'gmail*.spec.ts'); $paths += @(rg --files backend/src/document-import -g '*.spec.ts'); $paths += @(rg --files backend/src/reports -g 'report-review*.spec.ts'); $relative = @($paths | ForEach-Object { $_ -replace '^backend[\\/]','' }); npm --prefix backend test -- --runInBand --silent --runTestsByPath @relative

This checkpoint ran while final small corrections were consolidated; it is not claimed as a whole-suite run on the final tree. Final affected-regression checkpoint: 5 suites / 50 tests PASS, 71.946 seconds:

    npm --prefix backend test -- --runInBand --silent --runTestsByPath src/email-intake/email-intake.store.spec.ts src/email-intake/email-intake-runs.spec.ts src/email-intake/email-processing.spec.ts src/protected-pdf/protected-recovery.spec.ts src/protected-pdf/protected-pdf.service.spec.ts

Final added protected handoff ordering regression: command/result appended below.

Frontend focused checkpoint: 13 tests PASS. ChromeHeadless, CHROME_BIN set to existing C:/Program Files/Google/Chrome/Application/chrome.exe:

    npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.protected-pdf-spec.json --include=src/app/services/protected-pdf.service.spec.ts --include=src/app/pages/book-keeping/archived-documents/protected-pdf.spec.ts --include=src/app/services/document-approval-input.spec.ts --include=src/app/services/gmail-sync-state.spec.ts --progress=false

The final template adds PROTECTED_DELIVERY and WORK_BLOCKED counters after this passing test checkpoint; production compilation of the final template is recorded below. No full frontend test suite was run.

Intermediate backend Nest build and frontend production build passed. Final build results appended below. Local PDF parsing in synthetic fixtures is real; all external providers/storage/DB/AI are mocked. Simulated failures deliberately log DB outages, API/auth errors and mock Claude calls; these are expected assertions, not live activity.

Earlier diagnostic failures were inspected and corrected: nonexistent test path (not counted as pass), strict-negative deletion mock missing its raw decision proof, TypeScript metadata type, and a SQL string-literal quoting compile error. No thresholds weakened. A formatting script could not locate a snippet and made no formatting changes; builds/tests cover executable source. No baseline test failures remain in the executed scope.

## Risks and deferred checks

SQL syntax/column shape/FKs/transaction atomicity against an actual DEV database, live Composio pagination, real Drive deletion/ack-loss recovery, real AI output and browser end-to-end checks are UNEXECUTED by instruction. Schema proof is mocked, not database-tested. Review actual document_type (VARCHAR vs ENUM) before applying. No automatic data backfill.

Two processing slots and business locks coordinate running servers; an idle/scale-to-zero platform still needs an independently authorized wake-up configuration. Unknown paid-call outcomes become manual pending rather than automatic extraction replay. Max supported attachment remains 10 MiB. Stop states require operator attention; no administrative recovery screen added. Do not roll back to legacy scanning with managed work still in flight. No accounting posting/VAT rules changed; absent date/amount now must be completed before manual cash approval.

Final protected handoff check: PASS 1 suite / 1 test, 74.861 seconds: npm --prefix backend test -- --runInBand --silent --runTestsByPath src/email-intake/email-protected-handoff.spec.ts.

Final frontend production build: PASS, 157.079 seconds, hash 8e41d516e72713b1: npm run build -- --configuration production --progress=false (frontend directory). Budget/CommonJS warnings remain in unchanged styles/dependencies; initial bundle 3.20 MB versus 2 MB warning budget. No warning thresholds changed.

Read-only environment check verified DISABLE_SYNCHRONIZE=true and all four new flags unset (therefore false); no secret values printed or environment file changed. Prepared standalone and appended SQL blocks match byte-for-byte and the cutover marker occurs once. No SQL was executed.

Late recovery correction: runs persist integration_finalized_at and completed-but-unacknowledged initial/nightly runs remain claimable; this closes the crash window between scan completion and integration cursor/history update. Final affected scanner/store tests and Nest build are recorded below.

Final scanner/store checkpoint initially had 13 passes and one test-assertion failure: durableDownload was a plain fake, so Jest could not use toHaveBeenCalled. Corrected by spying on that fake. Scanner rerun on the final executable source: PASS 1 suite / 6 tests, 30.697 seconds: npm --prefix backend test -- --runInBand --silent --no-cache --runTestsByPath src/email-intake/email-intake-runs.spec.ts. Store suite passed all 8 tests in the preceding checkpoint and its inputs did not change afterwards. No broad rerun was needed.

Final no-output TypeScript compilation: PASS (exit 0): node backend/node_modules/typescript/bin/tsc --project backend/tsconfig.build.json --noEmit --incremental false.

A final Nest artifact build failed solely on ENOSPC writing four generated dist files. The user separately approved deleting only frontend/.angular/cache in this worktree. Resolved exact path and checked for reparse points before native PowerShell cleanup; approximately 3.3 GiB cache removed, over 4 GB free afterwards. No other files or Drive objects were deleted. Final artifact build retried after this cleanup; result below.

Final artifact build after authorized cache cleanup: PASS (exit 0): npm --prefix backend run build. Final staged whitespace check passed. Implementation is ready for review; schema application and live DEV activation remain unapproved and were not performed. No main merge, push or deploy.


## Separately authorized DEV schema application (2026-11-19)

User approved DEV schema only after implementation. All three prepared DDL statements applied successfully to guarded keepintax-dev; metadata/FKs/indexes/defaults verified, counts unchanged (91 imported / 188 extracted), 0 runs/items and 0 active work. Full evidence and controlled 4202 UI plan: docs/features/gmail-intake-durable-dev-schema.md. Four new flags explicitly false in ignored DEV .env; no application start, import, AI or Drive deletion. Earlier unexecuted-schema notes above describe the implementation checkpoint, superseded for DEV DDL only by this separate approval. No production, main integration, push or deploy.
