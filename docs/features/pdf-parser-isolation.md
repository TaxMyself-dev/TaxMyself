# PDF parser crash containment

The DEV intake crashed with ReferenceError: document is not defined inside pdf-parse's embedded pdf.js 1.10 FontLoader. A newly generated embedded-font PDF reproduced it on base 59ab91de: the old compiled inspector printed readable, then exited 1 from a late asynchronous exception. This is why an ordinary try/catch around getOperatorList was insufficient.

## Change

Both PdfInspectionService and the local Gmail extractPdfText utility now use protected-pdf/pdf-parser-process.ts. The parent never loads/evaluates pdf.js. A separate hidden Node child receives bytes on stdin and returns a validated result over IPC; only a valid result AND clean child exit 0 constitute success. A payload followed by a crash is rejected. Child exception/exit/pipe/spawn errors cannot escape into Nest; a deadline kills a hung parser. There is no global uncaughtException handler swallowing backend errors.

In this installed pdf.js version the relevant settings live on the exported PDFJS object, not getDocument options. The child sets PDFJS.disableFontFace=true, isEvalSupported=false and disableWorker=true before loading bytes. This avoids browser font DOM loading without removing text extraction or skipping all-page structural validation. No dependency/Node upgrade, fake global document or monkey-patch to node_modules.

Limits: inspection retains 10 MiB / 100 pages; text retains 15 MiB / first 3 pages / 20,000 characters. Inspection deadline 15 seconds, text deadline 10 seconds. Each child has --max-old-space-size=256 and strict unhandled rejections. This caps V8 old-space, not total native/RSS memory. The child is a crash/resource boundary, not an OS filesystem/network security sandbox. Existing caller concurrency remains unchanged; no new queue or infrastructure added. Binary input is not written to disk. Application credentials and inherited NODE_OPTIONS are not passed to the child; only required Windows/temp variables are inherited. Child stdout/stderr and raw parser errors/document contents are not returned or logged.

Existing readable/password-required/invalid/limit outcomes remain. Opening-password encryption differs from readable permissions-only restrictions. Invalid, unavailable, timeout or crash outcomes never authorize not-accounting deletion. No password collection, accounting changes, schema or data migration.

## Verification

Synthetic baseline command used pdfkit with existing Simpler-Regular.otf, then spawned the old compiled PdfInspectionService: 4,111-byte PDF, readable payload followed by exit 1 and document-is-not-defined. The same probe against final compiled code: readable, one page, exit 0, no DOM error. No real user document was downloaded/read for this reproduction.

Small diagnostic batch initially had 3 suites / 13 tests pass and 3 suites compile-blocked by a TypeScript union narrowing error. The adapter was corrected without weakening tests. The blocked suites then passed 3 suites / 13 tests in 19.164 seconds:

    npm --prefix backend test -- --runInBand --silent --runTestsByPath src/protected-pdf/pdf-parser-containment.real.spec.ts src/protected-pdf/pdf-inspection.service.spec.ts src/protected-pdf/pdf-inspection.real.spec.ts

The unchanged passing diagnostics covered pdf-parser-process.spec.ts, pdf-text-extraction.util.spec.ts and pdf-password-classification.spec.ts (13 tests). Real fixtures cover embedded fonts, password/AES-256 and permission-only PDFs, malformed bytes and >100 pages. Fault tests cover kill on timeout, invalid IPC, late failure after a success message, spawn errors and EPIPE.

Final focused compatibility checkpoint: 7 suites / 64 tests passed, 41.115 seconds, including the strengthened REAL subprocess crash after a success payload while the host HTTP server still returns 200, followed by another successful PDF read:

    npm --prefix backend test -- --runInBand --silent --runTestsByPath src/protected-pdf/pdf-parser-containment.real.spec.ts src/protected-pdf/protected-ai-boundary.spec.ts src/protected-pdf/protected-reader.spec.ts src/protected-pdf/protected-intake.spec.ts src/protected-pdf/protected-pdf.service.spec.ts src/integrations/services/gmail-reader.service.spec.ts src/document-import/document-import-trace.spec.ts

npm --prefix backend run build passed. No frontend executable changes; prior frontend build evidence reused. These are focused checkpoints with overlapping tests, not counts to add or a claim that a full suite ran.

## DEV runtime

AI, deletion, legacy Inbox OCR, nightly sync and protected dispatch remain off in the unchanged ignored DEV environment. Synchronization and boot seeding remain disabled. After checks, restored only backend 3002 with the existing single-mailbox 17 / Nagrut 5 rollout guards; no new import request created. The user-authorized existing durable run may continue on restart. No data/history reset, schema application, production access, main merge, push or deploy.
