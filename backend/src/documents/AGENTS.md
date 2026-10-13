## Purpose
Handles the full lifecycle of official documents the user issues (invoices, receipts, credit notes — Israeli tax-authority formats), plus the inbound OCR pipeline that extracts structured data from documents received from suppliers via Google Drive.

## Local PDF rendering and signing

- `pdf/document-pdf-renderer.service.ts` renders escaped, RTL HTML with bundled Simpler fonts via Chromium. Layout follows the approved spacious mockup: logo left, issuer right, recipient/date band, centered title/underline, framed tables and centered footer. Scripts and non-data requests are blocked; concurrency, row count and HTML size are bounded.
- `DOCUMENT_PDF_PREVIEW_RENDERER=local` enables local draft previews without calling FillFaster. `DOCUMENT_PDF_RENDERER=local` enables local issuance only with `DOCUMENT_PDF_LOCAL_SIGNING_VALIDATED=true`; defaults retain legacy issuance. Never silently return an unsigned PDF on signing failure.
- `FILLFASTER_API_TOKEN` is required for both old and new provider paths (no embedded token). `FILLFASTER_BASE_PDF_FID` must identify a clean signing template with no old-layout overlays. Signing envelope presence is checked in code; cryptographic signature validation, certificate trust and visual acceptance are separate release checks.
- Nullable `Documents.issuerPdfSnapshot` freezes issuer details and immutable `Business.logoPath` at preparation time. Finalization uses this snapshot, not a later replacement logo. Existing documents with NULL snapshots deliberately do not adopt a new logo. Apply prepared schema before deploying; no SQL is automatically executed by this feature.
- Renderer reuses existing sums/item/payment transforms and does not alter accounting calculations. Payment details column appears only when populated. Both `docSubtitle` (linked-document text) and `docDescription` (free note) are rendered; empty allocation/note fields are omitted.
- Standalone `scripts/render-document-samples.ts` produces visual fixtures without starting Nest, a database, or a provider session. See `docs/features/document-pdf-redesign.md` for configuration and rollout evidence.

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
- `POST /documents/create-doc`, `POST /documents/preview-doc` — validate + transform a `CreateDocDto`, persist header/lines/payments, generate PDF, post a journal entry (via bookkeeping) for revenue-generating types.
- `GET /documents/get-docs`, `GET /documents/get-doc-lines` — list/filter issued documents.
- `GET|POST /documents/get-setting-doc-by-type/:typeDoc`, `setting-initial-index` — manage per-business running-number counters.
- `POST /documents/rollback`, `POST /documents/finalize-allocation`, `PATCH /documents/update-status` — document lifecycle/allocation-number operations.
- `POST|GET|DELETE /documents/save-draft|load-draft|delete-draft` — draft persistence.
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
