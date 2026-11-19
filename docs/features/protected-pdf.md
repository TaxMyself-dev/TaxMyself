# Protected PDF lifecycle

Implemented locally on `codex/protected-pdf`, based on `be87eef7` (Composio/email intake). This feature has not been enabled or deployed.

## Activation gate

- Prepared SQL: `docs/features/protected-pdf.sql`. Three new InnoDB sidecar tables: `protected_documents`, `document_replacement_operations`, `protected_pdf_import_runs`. Existing entities/columns are unchanged. The prepared block is also included at the end of `docs/redesign/cutover.sql`; execute only one copy, and only with explicit approval for the target DEV database.
- `PROTECTED_PDF_ENABLED=false` and `PROTECTED_PDF_DISPATCH_ENABLED=false` by default. Keep TypeORM synchronization disabled. Disabled paths do not query new tables. SQL has NOT been applied.
- After separately approved DEV DDL, enable the feature to accept locked originals/replacements. Enable the dispatcher separately to recover staged uploads and deliver accepted replacements to the existing processing inbox. Existing processing may invoke AI after delivery; this is not an AI-free live test.
- This worktree uses frontend 4203/backend 3003. Its ignored environment was copied from the existing email feature and given distinct ports/callbacks. No secrets are tracked. Original feature servers/configuration were not changed.

## Lifecycle and contracts

`PdfInspectionService` checks all PDF pages locally, with a 10 MiB, 100-page and 15-second inspection limit. PasswordException means PASSWORD_REQUIRED; malformed and over-limit PDFs are distinct failures. Permissions-only encryption with a readable empty user password is accepted. Fixture tests cover RC4 and AES-256. No password input/storage is implemented.

For Gmail, shared intake, and manual upload, a locked original is retained in the selected business's blocked folder, registered in the existing import ledger, and linked to a durable protected-document ID. Inbox processing intercepts locked files before AI. Direct one-shot OCR rejects them before creating an AI client; it does not persist a document itself.

The business archive presents an orange password-required item until addressed. The upload action sends the positive protected-document ID, selected business, idempotency key, and explicit user confirmation. Synthetic archive projection IDs are never used for replacement identity. The server checks effective owner/represented-user permissions, business ownership and provisioned Drive folders before accepting bytes. Matching filename or hash never establishes an original/replacement relationship.

Replacement phases:

1. Reserve a versioned operation and bounded lease in the DB. Validate the entire open PDF locally.
2. Upload to the business's replacement-staging folder using a private operation tag. Do not expose an uncommitted replacement to inbox processing.
3. Commit a new import-ledger row with original provenance, root replacement link and durable PENDING outbox operation in one DB transaction. Keep the original bytes and ledger row. The logical archive hides the replaced original and superseded copies.
4. The separately enabled dispatcher moves the committed candidate to the existing INBOX, marks it QUEUED and lets normal document processing run. It does not call AI directly. Processing PENDING/SUCCEEDED/FAILED is tracked separately from upload acceptance; SUCCEEDED means pipeline completion, not necessarily an approved invoice.

## Failure and recovery

- Same operation key and same bytes/name return the same accepted operation. Different bytes under that key are rejected. Independent concurrent uploads are fenced by root version, attempt token and leases. Existing dedup data is never silently reassigned.
- Upload/DB failures retain originals and staged bytes. A repeated request can recover its private tagged file, checking SHA-256. With dispatch enabled, abandoned reservations older than five minutes also recover from their own tagged bytes, bounded to five attempts and fenced against newer replacement versions. No filename-based reconciliation or automatic file deletion occurs.
- Delivery retries are bounded; a crash after the Drive move can acknowledge the existing inbox/processed location without moving twice. DELIVERY_FAILED is visible and has an explicit retry-delivery action; this does not upload again.
- Processing failure keeps the accepted replacement and history visible. A different valid open copy can be submitted as a new version. Automatic AI reruns are not added. Re-uploading an already registered content hash is rejected rather than creating another document.
- History is owner/business-scoped and records original and replacement IDs, actor, times and phase/error codes. No passwords or raw provider errors are logged. Originals and abandoned tagged copies are retained; cleanup/retention policy is a separate task.
- Recovery requires at least one successful durable reservation and uploaded bytes. A request failing before either must be submitted again. Exhausted or unrecoverable intake/storage failures require operator inspection; no destructive repair is automatic.

## Verification (2026-11-19)

All service/HTTP tests use mocks and synthetic fixtures. No live import, AI execution, mail search, document upload, user-data mutation, schema application, PROD operation, main integration, push or deploy was performed.

- Final protected backend batch: 8 suites, **41 tests passed**, 17.789 s. Command: `npm --prefix backend test -- --runInBand --silent --runTestsByPath src/protected-pdf/protected-recovery.spec.ts src/protected-pdf/protected-pdf.service.spec.ts src/protected-pdf/protected-intake.spec.ts src/protected-pdf/pdf-inspection.real.spec.ts src/protected-pdf/pdf-inspection.service.spec.ts src/protected-pdf/protected-ai-boundary.spec.ts src/protected-pdf/protected-reader.spec.ts src/protected-pdf/protected-import-summary.spec.ts`.
- Affected baseline regression batch: 11 suites, **86 tests passed**, 50.985 s. Explicit paths: existing gmail-reader, gmail-drive-import, gmail-sync, integrations.controller, document-import cleanup/recovery/trace, documents inbox restore/lock, archived delete/reclassification specs. This preceded the final isolated recovery-worker additions; it is not represented as a full-suite run on the final revision.
- Frontend: **7 tests passed** using `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.protected-pdf-spec.json --include=src/app/services/protected-pdf.service.spec.ts --include=src/app/pages/book-keeping/archived-documents/protected-pdf.spec.ts --progress=false`. CHROME_BIN selected the installed Google Chrome. UI flow and explicit-ID HTTP contracts were tested without booting the full archive application.
- Backend Nest build and frontend production build passed during implementation. Final backend build is recorded in the task note. Final frontend build used `npm run build -- --configuration production --progress=false`; existing CommonJS/style budget warnings remain. A subsequent mobile badge stylesheet reorder was checked with standalone Sass compilation, with zero warnings; functional frontend inputs did not change afterwards.
- A mistakenly broad Jest path-pattern run was interrupted after confirming it selected unrelated suites. It is not passing evidence. Frontend initial heavy-component runner disconnected; isolating the actual upload flow fixed the test scope. An initial UUID factory typing issue was corrected before the seven-test pass.
- Read-only DEV metadata check verified database name `keepintax-dev`, the existing imported_documents primary key type INT/InnoDB, and absence of the three new table names. No user rows were read or modified. New-table DDL execution and real browser/Drive processing remain untested pending explicit DEV approval.
