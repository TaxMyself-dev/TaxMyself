# Bounded Gmail full-flow UI check in DEV

Prepared 2026-11-20 on codex/composio-email, after 77e657d8. No production, schema, main integration, push or deploy.

## Authorized state change

The user requested resetting the existing queue and testing both processing and deletion through localhost:4202. Exactly 101 untouched MOVE_PENDING records for integration 17 / business 5 were changed to WORK_BLOCKED with DEV_QUEUE_RESET. One completed-pull historical run changed from processing RUNNING to ATTENTION with the same audit code. A private before-state snapshot was saved outside Git before committing the transaction. No records, Drive files, dedup identities, history, protected roots, or extracted results were removed. The 32 previously BLOCKED_INVALID and 5 PASSWORD_REQUIRED records remain unchanged; reset means an empty active queue, not an empty archive or permission to reimport old content.

The initial compound activation was rejected by automatic approval review because it would have enabled general processing/deletion under an earlier artificial-only authorization. No action from that rejected command executed. The revised implementation fences the processing/deletion worker itself, not merely new scans, and a separately executed reset changed no flags. The subsequent bounded activation was accepted.

## DEV-only guard

Optional GMAIL_DURABLE_DEV_TEST_SUBJECT must match KEEPINTAX-DEV-[A-Z0-9-]{8,80}. It fails closed unless DB_DATABASE=keepintax-dev, COMPOSIO_ENVIRONMENT=dev, and NODE_ENV is not production. Omit it for ordinary behavior; it is not a production setting.

When present, UI scan requests freeze the query as `has:attachment subject:"<configured subject>"`. The due-work selector filters by a matching run with identical owner and business. Direct processing and deletion verify that same run, then the configured integration/business bounds. Both existing and newly enqueued work with another query are rejected. No schema changes or frontend changes were required.

Current local DEV flags (ignored .env):

    GMAIL_DURABLE_INTAKE_ENABLED=true
    GMAIL_DURABLE_SCAN_ENABLED=true
    GMAIL_DURABLE_PROCESS_ENABLED=true
    GMAIL_DURABLE_DELETE_ENABLED=true
    GMAIL_DURABLE_DEV_TEST_SUBJECT=KEEPINTAX-DEV-UI-20261120-B1
    GMAIL_DURABLE_ALLOWED_INTEGRATION_IDS=17
    GMAIL_DURABLE_REQUIRED_BUSINESS_NUMBER=314719279
    INBOX_OCR_ENABLED=false
    GMAIL_NIGHTLY_SYNC_ENABLED=false
    PROTECTED_PDF_DISPATCH_ENABLED=false

The owned backend was restarted on 3002 with synchronize disabled and boot seeding skipped. Root health HTTP 200; frontend localhost:4202 HTTP 200. No mailbox scan, AI request or Drive deletion was initiated while preparing this check. Empty eligible queue and rejection of the old run were verified with the compiled store against DEV before flags were changed.

## User steps

1. Extract send-these-15.zip locally. Attach the 15 individual PDFs, NOT the ZIP, to one or more messages sent to the dedicated test mailbox. Give every message the exact subject KEEPINTAX-DEV-UI-20261120-B1. Do not attach the open replacement copies yet.
2. In localhost:4202 open Settings / Gmail. Choose only the dedicated mailbox and use the ordinary manual pull button. The DEV guard restricts that button to this subject; it does not scan the previous 90-day default range. The bounded batch comes from sending exactly 15 files with this unique subject, not from a hidden first-15 truncation.
3. Observe pull status, processing status and accepted-file count. Pull completion precedes processing completion. No manual start of the processor is needed: the scoped worker polls every 5 seconds, with existing limited concurrency.
4. In the existing archive choose Nagrut (5). The kit contains 9 accounting files spanning all six types, 3 clearly non-accounting files, and 3 password-protected originals. The parser was verified to report 12 readable / 3 password_required. The expected model result is 9 pending user review, 3 confirmed removals from managed Drive, and 3 requiring password. Classification is an observed test result, not guaranteed by fixture filenames: uncertainty or errors must retain the file. No expense is automatically approved or posted.
5. Non-accounting originals remain in Gmail. Drive deletion requires a valid explicit negative plus the usual reference/identity checks and acknowledgement. Repeating the same pull should skip existing content and deleted-content tombstones rather than creating or processing copies again.
6. Optional replacement upload is a separate phase: open copies for the three locked files are supplied separately. Protected-PDF dispatch deliberately remains false. Uploading a replacement is not a promise that it will auto-process under this configuration; authorize/enable that route separately if it is part of the next check.

These are synthetic documents. Do not approve them as real accounting entries. The old archive entries are retained and may still be visible, so identify new files by names 01 through 15 and document numbers UI-B1-*.

## Verification

- Focused guard/scan/store/processing command: `npm --prefix backend test -- --runInBand --silent --runTestsByPath src/email-intake/email-dev-test-scope.spec.ts src/email-intake/email-intake-runs.spec.ts src/email-intake/email-intake-scope.spec.ts src/email-intake/email-intake.store.spec.ts src/email-intake/email-processing.spec.ts` — 5 suites / 48 tests PASS, 98.223 seconds.
- Earlier scan-only checkpoint: 3 suites / 23 tests PASS; superseded by the 48-test run after adding the worker fence.
- `npm --prefix backend run build` PASS after final executable changes.
- All 15 actual fixtures checked with the compiled PdfInspectionService: 12 readable and 3 password_required. pypdf independently checked encryption/page count/content, and local preview renders were inspected. Inputs and previews stay outside Git.
- `git diff --check` PASS.

The prior 385-backend/13-frontend QA remains historical evidence for the preceding revision; it was not rerun wholesale for this scoped DEV guard. No real AI or delete was run in this setup task. The user-driven UI pull is the next test.

## Stop / restore

Set GMAIL_DURABLE_PROCESS_ENABLED=false and GMAIL_DURABLE_DELETE_ENABLED=false, then restart this backend to pause the test. Keep the subject guard in place while either worker flag is enabled. Do not remove the guard while forgetting that it is the queue fence. Remove it only after intentionally deciding the wider rollout scope.

The old held jobs remain individually recoverable from the private snapshot; do not bulk-reset them to READY or delete dedup rows to force another import. Protected dispatch/nightly/legacy OCR stay disabled until separately considered.
## Follow-up diagnosis: blocked PDFs

The user subsequently requested permanent cleanup of the 101 held DEV imports and an explanation of BLOCKED_INVALID. Five read-only samples (210, 213, 215, 216, 217) were downloaded with SHA-256 verified. All five open without a password in pypdf, and all their pages render with PDFium (2, 2, 4, 2, 2 pages). The application's isolated pdf.js 1.10 parser returns a readable IPC payload, then exits with code 1 because JPEG handling calls the browser global Image, which does not exist in Node: ReferenceError: Image is not defined at loadJpegStream. The containment boundary correctly prevents the main backend from crashing, but maps the failed child to invalid, causing a false BLOCKED_INVALID for these samples. This is a reader compatibility defect, not evidence that those documents are corrupt or non-accounting. The other 27 were not individually diagnosed. No AI or reimport was run, no blocked-file state was changed, and a parser fix was not part of this cleanup/diagnosis request.
Permanent cleanup completed: exactly 101 selected files received Drive deletion acknowledgement and a confirming metadata 404, then their import rows and linked attachment items were removed. Zero blocked cleanup items. Post-check: zero selected import rows remain; 32 BLOCKED_INVALID and 5 PASSWORD_REQUIRED unchanged. Gmail originals were not modified. The local historical reset snapshot remains outside Git. No schema/runtime/code change was made in this follow-up.
