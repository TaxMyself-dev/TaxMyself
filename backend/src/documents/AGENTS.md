## Purpose
Handles the full lifecycle of official documents the user issues (invoices, receipts, credit notes — Israeli tax-authority formats), plus the inbound OCR pipeline that extracts structured data from documents received from suppliers via Google Drive.

## PDF rendering and signing

- `pdf/document-pdf-renderer.service.ts` renders escaped, RTL HTML with bundled Simpler fonts via Chromium. Layout follows the approved spacious mockup: logo left, issuer right, recipient/date band, centered title/underline, framed tables and centered footer. Scripts and non-data requests are blocked; concurrency, row count and HTML size are bounded.
- Local development and the standalone PDF service reuse one Chromium process with a fresh BrowserContext per render; contexts close on success/error. Disconnected browsers relaunch on the next request, without retrying a failed issuance. Service failures/timeouts retire the process; failed local context cleanup also retires it. Browser cleanup is bounded and module destruction/service shutdown closes the cached browser. Recycle after 100 renders (local recycling waits until no other render is active). Existing concurrency limits remain unchanged. HTML waits for load followed by explicit font readiness and image decoding; failed assets prevent printing. The standalone deadline and bounded cleanup still apply.
- Development-only `pdf/pdf-diagnostics.ts` correlates full create/preview HTTP requests via AsyncLocalStorage and `X-Pdf-Diagnostic-Id`. It records DTO prep, sequential creation stages, original/copy rendering/signing and transport spans, linking HTTP render IDs to service logs. Optional `PDF_DIAGNOSTICS_FILE` captures sanitized JSONL only in development. Parent and nested spans overlap; do not sum both. Never include document/user data or credentials in diagnostic events. Signing failures expose only a development-only HTTP status/allowlisted network code or invalid-envelope category; response bodies and tokens remain hidden. Failed creation timing separates the interrupted stage from rollback/release.
- Manual `createDoc` prepares one request-scoped PDF model/logo for original and copy. It renders the original, overlaps original signing with copy rendering, then signs the copy (signing calls remain sequential). Both signed PDFs are uploaded concurrently; wait for both upload outcomes and attempt cleanup of successful siblings before propagating failure/rolling back. DB numbering/journal/commit, preview signing policy and existing issued files are unchanged. Pending-allocation finalization and system billing retain their existing orchestration; the local/shared renderer readiness change applies to all render callers.
- Numeric/date columns and headings remain on one line. Automatic table layout allocates numeric columns their intrinsic width, including grouped digits and cents; descriptions/payment details may wrap. Summary labels and amounts do not wrap or shrink; the summary block can expand rightward. Browser layout checks cover large and negative amounts without changing the strings or accounting calculations.
- `PDF_SERVICE_URL` routes previews and issuance rendering to the private standalone `pdf-service` over synchronous IAM-authenticated HTTP. Cloud Run fails closed if it is missing; never fall back to launching a browser in the backend after a remote failure. Local development without it retains the installed-browser renderer. The backend Dockerfile/Node 18 environment is unchanged. See `pdf-service/README.md` for setup, verification and future queue boundaries.
- Previews are unsigned; issuance always calls FillFaster in the backend. Never return an unsigned PDF on signing failure. `FILLFASTER_API_TOKEN` remains backend-only. Signing uses the verified clean template `3IfhJjgmAp`, fixed in code. Signing envelope presence is checked in code; certificate trust is separate.
- Issuer details and `Business.logoPath` are resolved from the current business when generating a PDF, including pending-allocation finalization. No issuer snapshot column is required. Already-issued PDFs are served from their stored paths; changing a logo does not rewrite them. System billing receipts retain the explicitly supplied company identity. Only the two image-path columns require schema preparation.
- Renderer reuses existing sums/item/payment transforms and does not alter accounting calculations. Payment details column appears only when populated. Both `docSubtitle` (linked-document text) and `docDescription` (free note) are rendered; empty allocation/note fields are omitted.
- Standalone `scripts/render-document-samples.ts` produces visual fixtures without starting Nest, a database, or a provider session. See `docs/features/document-pdf-redesign.md` for configuration and rollout evidence.

## Known discount audit findings (2026-10-18, not fixed)

- Discount/before-discount rows are absent for VAT-liable businesses across all
  seven PDF types; item tables omit line discounts. Exempt pre-discount row reads
  sumWithoutVat, which only coincides with stored sumBefDisBefVat in some paths.
- Mixed VAT summary labels and credit untaxed omission can make displayed
  components fail to reconcile with the unchanged final total. Characterization
  evidence is in `pdf/document-pdf-discount-audit.spec.ts`; passing reproduces
  current behavior, not correctness. See task `docs/tasks/active/pdf-service.md`.
- A separate frontend VAT-inclusive discount aggregation discrepancy was
  reproduced. Changing calculation amounts is outside the display-audit scope.

## Key entities/files
- `documents.entity.ts` — `Documents`: issued document header (issuer/recipient details, doc type/number, sums, VAT, dates, parent-doc linkage for credit notes, `journalEntryNumber`/`journalEntryId` FK to bookkeeping). Unique per `(issuerBusinessNumber, docType, docNumber)`. The nullable UNIQUE `billingAttemptId` is reserved for the future atomic billing finalization path; KT-032 registers the provenance FK but does not wire document creation to it yet.
- `doc-lines.entity.ts` — `DocLines`: line items of an issued document (quantity, unit price, discount, VAT per line).
- `doc-payments.entity.ts` — `DocPayments`: payment details attached to an issued document (bank/check/credit-card info).
- `settingDocuments.entity.ts` — `SettingDocuments`: per-user/business/docType running-number counters (`currentIndex`/`initialIndex`); also reused by other modules as a generic per-business counter (e.g. journal entry numbers).
- `extracted-document.entity.ts` — `ExtractedDocument`: OCR results (Claude) for documents received from suppliers via Drive inbox — one row per invoice/receipt found in a Drive file, with status workflow (`PENDING_REVIEW`→`APPROVED`/`ARCHIVED`/`REJECTED`/`PAIRED`/`ERROR`), independent nullable `deletedAt` archive visibility, invoice/receipt pairing fields, currency/FX normalization, and matching to bank transactions.
- `documents.service.ts` — `DocumentsService`: the large core service — issued-document CRUD/PDF generation (`createDoc`, `previewDoc`, `saveDocInfo`/`saveLinesInfo`/`savePaymentsInfo`, `rollbackDocumentAndIndexes`, `finalizeAllocation`, drafts), running-number index management, plus inbound OCR flow (`processInboxForUser`, `ocrSingleFile`, `uploadAndOcrDoc`, `buildExtractionCatalog`, `getReviewableForUser`, `archiveDocument`). `buildExtractionCatalog` was a Phase 2.4 leftover (fixed 2026-07-12): it now delegates to `bookkeeping/catalog.service.ts`'s `CatalogService.getMergedExpenseCatalog`, not the frozen `DefaultSubCategory`/`UserSubCategory` tables directly — that direct read 500'd against real prod data (`subAccountCode` was never actually present there, only synced into dev by the shared dev DB's `synchronize=true`). Since Phase 5.1 its ctx is delegation-aware (`CatalogContextService.forUser`), so the client's accountant-layer catalog rows appear in the OCR classification hint and review dropdowns.
- `document-processor.service.ts` — `DocumentProcessorService.extract()`: calls out to Claude to OCR/classify a document file.
- `document-pairing.service.ts` — `DocumentPairingService`: auto-pairs INVOICE + RECEIPT `ExtractedDocument` rows from the same supplier/invoice number (`pairInvoicesAndReceiptsForBusiness`, `unpair`).
- `documents.controller.ts` — `DocumentsController` at route `documents`, gated by `FirebaseAuthGuard` + `SubscriptionGuard` + `RequireModule(INVOICES)`.

## Main flows

- Restored draft line payloads are normalized at the DTO boundary: MySQL
  `DECIMAL` strings become numbers, numeric VAT options become their enum names,
  and `unitType` is validated as `UnitOfMeasure`. A malformed legacy derived
  gross value may be rebuilt only from that line's validated net and VAT values.
- `POST /documents/create-doc`, `POST /documents/preview-doc` — validate + transform a `CreateDocDto`, persist header/lines/payments, generate PDF, post a journal entry (via bookkeeping) for revenue-generating types.
- `GET /documents/get-docs`, `GET /documents/get-doc-lines` — list/filter issued documents.
- `GET|POST /documents/get-setting-doc-by-type/:typeDoc`, `setting-initial-index` — manage per-business running-number counters.
- `POST /documents/rollback`, `POST /documents/finalize-allocation`, `PATCH /documents/update-status` — document lifecycle/allocation-number operations.
- Allocation-required issuance first persists the header/lines/final running
  number with `PENDING_ALLOCATION`. SHAAM saves `allocationNum` independently
  before `finalizeAllocation` generates PDFs, posts the existing journal flow
  and changes the status. Finalization never clears an already persisted
  allocation number, so a PDF/upload failure is safely retryable.
- `allocationNum` is `varchar(50)` because the production Invoice Information
  v2 portal schema permits `confirmation_number` values up to 50 characters;
  never truncate an upstream allocation number.
- `POST|GET|DELETE /documents/save-draft|load-draft|delete-draft` — draft persistence.
  Issuance removes the matching saved draft inside the same transaction after
  reserving the official number and before inserting the document row. This
  prevents a restored OAuth draft holding the peeked number from colliding with
  the unique official document identity; rollback restores both draft and counters.
- PDF generation and draft persistence must not log document payloads, line
  descriptions, recipient/issuer identifiers, amounts, allocation numbers or
  upstream response bodies. Operational logs may include status/error codes and
  template identifiers only.
- `POST /documents/me/process-inbox` — scans a business's Drive inbox folder, OCRs new files via `DocumentProcessorService`, dedupes by content hash, auto-restores a retained soft-deleted document when identical bytes are re-uploaded, runs pairing, moves processed files.
- Byte-identical live duplicates are recorded as `REJECTED` without another OCR
  pass and persist the user-facing rejection reason `קובץ כפול`; the diagnostic
  `rawResponse` retains the original Drive file id. Archive projection also
  recognizes that diagnostic on older duplicate rows whose persisted reason is
  null, so existing records display the same reason without a data rewrite.
- `POST /documents/me/ocr-file` — OCR a single uploaded file on demand.
- `GET /documents/me/catalog`, `GET /documents/me/review` — build the review UI's list of extracted/matched documents.
- `POST /documents/me/archive/:documentId` — archive a reviewed `ExtractedDocument`.
- `GET /documents/me/archived`, `DELETE /documents/me/archived/:documentId`, `PATCH /documents/me/archived/:documentId/restore` — unified archive list plus file-scoped soft delete/restore. The list preserves distinct user-facing states for approved expenses, annual filings, archived/rejected/error rows and exposes `canResolve` only for visible `PENDING_REVIEW` documents. Delete sets `deletedAt` without changing lifecycle status or removing the Drive file/accounting links; operational review, pairing and matching queries exclude deleted rows.

- The unified archive also includes manual/open-banking `Expense` rows and
  unmatched recognized `SlimTransaction` rows awaiting approval. Pending
  transaction rows use the durable slim display snapshot rather than the
  nightly-cleared full transaction cache; matched transactions remain
  represented by their document to avoid duplicate archive entries.
  Transient `canResolve`/`canManageExpenses` capabilities are true only for an
  unrepresented owner, an admin, or an agent holding `EXPENSES_APPROVE`;
  represented owners and read-only delegates receive no accounting actions.

## Related topics
- `createBillingSystemReceipt` accepts optional frozen subscription periods
  (KT-040): validates their net/VAT/gross totals against the captured payment,
  then creates one TAX_INVOICE_RECEIPT with one numbered line per period and
  one card payment through the existing createDoc/journal transaction. Canonical
  billingAttemptId still enforces one document per attempt; numbering, PDF and
  email paths are unchanged. Missing periods retain the single-line fallback.
- bookkeeping (`JournalEntry`/`JournalLine`/`BookingAccount` — renamed from `DefaultBookingAccount`, Phase 1.2 of the categories redesign — `BookkeepingService` — journal entries posted for issued documents; `CatalogService.getMergedExpenseCatalog` — the OCR extraction catalog, since 2026-07-12)
- expenses (`Expense`, `Supplier` — OCR'd documents become expenses)
- transactions (`SlimTransaction` — matching extracted documents to bank transactions; legacy `Transactions` registered only for `SharedService`)
- business (`Business`, `BusinessService` — per-business folders and settings)
- users (`UsersModule`, `User` entity)
- billing (`BillingModule` — subscription/module gating)
- google-drive (`GoogleDriveModule` — inbox scanning, file move/download)
- mail (`MailModule`)
- shared (`SharedService`, `FxRateService`/`FxRate` — currency normalization for non-ILS OCR'd documents)
- delegation (`Delegation` entity registered in module)
- demo-data (depends on this module: `DocumentsService.createDoc` used to seed demo income documents)
