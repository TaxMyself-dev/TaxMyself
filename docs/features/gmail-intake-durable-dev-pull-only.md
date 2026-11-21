# Controlled DEV pull-only activation — 2026-11-19

User authorized enabling only the new Gmail pull for the existing test mailbox, targeting Nagrut (Business row id 5), with AI/deletion off. Existing codex/composio-email worktree, based on a3da6a98. No main integration, push or deploy.

## Scope proof and controls

Read-only guarded keepintax-dev inspection: integration 17 is ACTIVE / COMPOSIO and its initial import is completed. Its existing owner has businesses 5 (Nagrut) and 225; both currently have PRIMARY roles. Existing resolver orders id ascending and selects the first primary, so the resolved target is Nagrut 5. Both Drive folder references already exist. Ownership, roles, history and folder IDs were not modified. A diagnostic query initially used entity property names for Drive columns, failed without mutation, then was corrected using the actual mapped snake-case column names.

Added optional GMAIL_DURABLE_ALLOWED_INTEGRATION_IDS and GMAIL_DURABLE_REQUIRED_BUSINESS_NUMBER bounds in assertEmailIntakeScope. Configured only in the ignored local environment: mailbox 17 and Nagrut's actual businessNumber. They reject an out-of-scope creation and reject existing out-of-scope runs before claiming/downloading. They DO NOT change business routing or mailbox ownership. Malformed mailbox bounds fail closed. These optional bounds are unset by default elsewhere.

Added INBOX_OCR_ENABLED=false support to the legacy InboxOcrCronService and DocumentsService.processInboxForUser entry point, so scheduled, report-triggered and manual/camera-triggered legacy INBOX extraction is paused during the DEV test. Default behavior is unchanged when this setting is unset. This is necessary because the new PROCESS=false flag alone did not pause the older OCR pathway. This pause affects all legacy INBOX processing in this DEV backend, deliberately; it does not disable unrelated direct AI features elsewhere in the application.

## Active local configuration

GMAIL_DURABLE_INTAKE_ENABLED=true and GMAIL_DURABLE_SCAN_ENABLED=true. GMAIL_DURABLE_PROCESS_ENABLED=false and GMAIL_DURABLE_DELETE_ENABLED=false. INBOX_OCR_ENABLED=false; GMAIL_NIGHTLY_SYNC_ENABLED=false; PROTECTED_PDF_DISPATCH_ENABLED=false; DISABLE_SYNCHRONIZE=true; SKIP_BOOT_SEED=true; PORT=3002. Actual credentials and rollout businessNumber stay out of tracked files. backend/.env remains ignored.

Started only the built DEV backend with a hidden detached Node process from this worktree's backend directory. Environment was parsed from that exact DEV .env and passed explicitly to the child; asserted keepintax-dev / port 3002 / extraction and deletion off before launch. Startup log confirmed keepintax-dev synchronize=false and listening on 3002. Local root health returned status ok; 4202 returned HTTP 200 and its source environment points at localhost:3002. No other worktree/process was stopped or changed; the previous 3002 process had already exited before launch. Logs/process metadata are in the local OS temp directory, not Git.

After startup: run count 0, item count 0, managed work count 0, imported_documents 91, extracted_document 188. No import request, mailbox search/download, AI, Drive mutation/deletion or data reset was performed by the agent in this activation step. Real pulling will begin only after the user's UI click.

## UI exercise now available

1. In the dedicated test mailbox, send a new artificial PDF with new content bytes, e.g. subject KEEPINTAX-DEV-PULL and filename keepintax-dev-pull.pdf. Reusing the previously imported PDF's exact bytes should produce a duplicate rather than a new document.
2. Refresh localhost:4202. Open Settings -> Gmail -> Pull documents now, clear selection and choose only the known test mailbox (integration 17). Its completed initial import means no reset/reconnection or initial-import button is needed.
3. Click Pull documents. A durable run card appears. Its businessNumber must be Nagrut's configured number, not the internal row id 5. Server scope guards prevent another target or mailbox from being accepted.
4. The existing manual button scans the test mailbox attachment window of the last 90 days, not only a subject/filename. It does not offer a query override or business picker. Observe pull COMPLETE and imported/duplicate/skip/password/error counts; new readable documents wait READY for processing in this business INBOX. No AI extraction or accounting posting is expected. Processing may still display RUNNING for pending work; PROCESS is explicitly off, so that reflects queued work, not an active paid call.
5. Repeat the same manual pull: registered message/part identities or content hash must count duplicates and must not create a second stored document. Ask for verification after the run. Do not enable processing or deletion or unpause legacy OCR as part of this test.

Rollback/pause: setting SCAN=false stops further scan ticks without deleting run state. Keep INTAKE enabled and PROCESS/DELETE/legacy OCR off for queued managed files; do not disable INTAKE and fall back to legacy scanning while work remains. Restoring prior OCR behavior or enabling real AI/deletion is a separate approval.

## Verification

PASS 4 suites / 19 tests, 42.208 seconds: npm --prefix backend test -- --runInBand --silent --runTestsByPath src/email-intake/email-intake-scope.spec.ts src/email-intake/email-intake-runs.spec.ts src/documents/documents-inbox-lock.spec.ts src/documents/inbox-ocr-cron.service.spec.ts.

After adding service-level rejection coverage, PASS 1 suite / 8 tests, 27.83 seconds: npm --prefix backend test -- --runInBand --silent --runTestsByPath src/email-intake/email-intake-runs.spec.ts. Other passing inputs unchanged. Not claimed as a whole-suite run on the final tree.

Final npm --prefix backend run build: PASS. No frontend executable changes, so previous frontend tests/build were reused; no unnecessary frontend rebuild. Live checks were local HTTP health and DEV metadata/aggregate SQL only, not an end-to-end import. No schema change was needed for this activation.
