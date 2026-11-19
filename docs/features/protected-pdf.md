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

## Approved DEV activation and controlled smoke — 2026-11-19

Elazar explicitly approved creating the three tables in DEV and enabling a controlled synthetic locked/open PDF test. The earlier no-live-test notes above describe the pre-activation implementation checkpoint.

- Executed `node scripts/protected-pdf-dev-smoke.cjs --apply-schema` from backend. The script asserted both the configured and connected database were `keepintax-dev`, Composio environment was `dev`, business 5 was נגרות with an owner and provisioned folders, and all three new tables were absent. Exactly the three prepared CREATE TABLE statements succeeded; all three were verified as InnoDB. No existing table was altered. Prepared SQL SHA-256: `4dacf487664f8dc3b139e281f56e0cb400924d53d4942cc7049ae5f69d55ed03`.
- Set `PROTECTED_PDF_ENABLED=true` in this worktree's ignored backend/.env. Kept `PROTECTED_PDF_DISPATCH_ENABLED=false`. The existing .env remains ignored; no credentials were printed or committed.
- Executed `node scripts/protected-pdf-dev-smoke.cjs --synthetic-test` successfully (exit 0), run `832c0f6d-1440-4fcd-8374-9b3096e81414`. Used a blank AES-256 password-required synthetic fixture and readable matching blank PDF, with a unique non-sensitive run comment appended to each; no real mail/documents were used.
- Created protected-document ID **1**, original import **197**, replacement import **198**, in business **5** only. Created/reused the business's blocked and replacement-staging child folders and uploaded exactly two synthetic files. Original stays in blocked; replacement stays in staging. Original ledger/source/Drive linkage is retained. Manual synthetic source was used; no artificial Gmail provenance or connection history was created.
- Verified actual database transactions, one replacement operation, idempotent repeat returning the same operation, no additional tagged candidate, scoped authorization denial, rejection without user confirmation, rejection of another locked replacement, original still password-required, downloaded replacement byte equality, same owner/business/source, and one logical archive projection hiding the replaced original.
- Accepted replacement is **PENDING / NOT_STARTED**, not processed. No inbox delivery, Nest boot, scheduler, Gmail sync/search/import, or AI invocation occurred. Scoped extracted_document count for these two synthetic files remained zero. This verifies the persistence/Drive/upload path, not actual browser interaction or AI completion.
- Initial preflight SELECT used property names instead of mapped Drive column names and failed with ER_BAD_FIELD_ERROR before any mutation. Schema metadata resolved the names, and corrected preflight passed before DDL.
- Local ports 3003 and 4203 are already occupied. The backend listener was identified as a different feature worktree, so it was not stopped/restarted. No application server was started for this worktree. Activation takes effect when this worktree's backend is launched with its own DEV environment on available ports; a different worktree's running server does not load this configuration.
- Reusable smoke harness performs explicit mode, DEV database/Composio, business identity and dispatch-off checks, disables synchronize/migrations/logging, and loads only three entities/services without booting Nest. Running the synthetic mode again intentionally creates a fresh synthetic pair; do not rerun it as a read-only health check.
- `node --check backend/scripts/protected-pdf-dev-smoke.cjs` passed. No production code changes since the previously passing feature/regression tests/builds; those checks were not repeated for this diagnostic script/documentation update.
- No PROD operation, main integration, push or deploy. Original email and other running feature worktrees were untouched.

## Composio Email integration

The feature was locally fast-forwarded into `codex/composio-email` on 2026-11-19 at Elazar's request. That worktree retains frontend **4202** / backend **3002**, and its existing ignored DEV environment now has protected handling enabled and automatic delivery disabled. The earlier **4203/3003** settings describe the separate protected-PDF source worktree. No credentials were copied, schema reapplied, live import/AI started, or application server restarted during the merge. For interactive use, start/restart the backend from the Composio Email worktree so it reads its updated environment.

### Archive NULL-ID regression

A locked original has no replacement Drive ID yet. The archive must never treat unrelated manual expenses or bank transactions with null Drive IDs as its existing projection. The 2026-11-19 correction requires an actual candidate ID before matching; SQL-realistic regression tests cover a mixed archive. Existing locked originals require no re-upload or data repair: reload the corrected backend and refresh the archive.

### Approved single-file processing smoke

On 2026-11-19 Elazar authorized processing only protected document 2's open replacement in DEV business נגרות (5). `node scripts/protected-pdf-dev-process-one.cjs --document-2` completed under the ordinary business OCR lock, without booting Nest/schedulers or listing the business inbox. A guarded Drive reader supplied metadata only for replacement import 200; real claim/persistence, catalog, delivery, extraction and one-operation reconciliation paths were used. Automatic flags stayed off in .env. The script refuses already processed attempts and is not a recurring job or read-only health check.

One AI request returned `{ "invoices": [] }` for the blank synthetic PDF. The existing processing pipeline consequently saved OCR row 7578 with status `error` and marked the replacement's processing `FAILED`; upload/delivery linkage remained accepted, the open copy moved to processed, and original import 199 remained retained/locked in blocked. This confirms the end-to-end empty-document/failure path, not successful extraction of an actual invoice. Earlier replacement 1 stayed PENDING/NOT_STARTED. No additional AI request or processing of other documents occurred.
