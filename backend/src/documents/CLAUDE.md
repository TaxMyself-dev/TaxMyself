## Purpose
Handles the full lifecycle of official documents the user issues (invoices, receipts, credit notes — Israeli tax-authority formats), plus the inbound OCR pipeline that extracts structured data from documents received from suppliers via Google Drive.

## Key entities/files
- `documents.entity.ts` — `Documents`: issued document header (issuer/recipient details, doc type/number, sums, VAT, dates, parent-doc linkage for credit notes, `journalEntryNumber`/`journalEntryId` FK to bookkeeping). Unique per `(issuerBusinessNumber, docType, docNumber)`.
- `doc-lines.entity.ts` — `DocLines`: line items of an issued document (quantity, unit price, discount, VAT per line).
- `doc-payments.entity.ts` — `DocPayments`: payment details attached to an issued document (bank/check/credit-card info).
- `settingDocuments.entity.ts` — `SettingDocuments`: per-user/business/docType running-number counters (`currentIndex`/`initialIndex`); also reused by other modules as a generic per-business counter (e.g. journal entry numbers).
- `extracted-document.entity.ts` — `ExtractedDocument`: OCR results (Claude) for documents received from suppliers via Drive inbox — one row per invoice/receipt found in a Drive file, with status workflow (`PENDING_REVIEW`→`APPROVED`/`ARCHIVED`/`REJECTED`/`PAIRED`/`ERROR`), invoice/receipt pairing fields, currency/FX normalization, and matching to bank transactions.
- `documents.service.ts` — `DocumentsService`: the large core service — issued-document CRUD/PDF generation (`createDoc`, `previewDoc`, `saveDocInfo`/`saveLinesInfo`/`savePaymentsInfo`, `rollbackDocumentAndIndexes`, `finalizeAllocation`, drafts), running-number index management, plus inbound OCR flow (`processInboxForUser`, `ocrSingleFile`, `uploadAndOcrDoc`, `buildExtractionCatalog`, `getReviewableForUser`, `archiveDocument`).
- `document-processor.service.ts` — `DocumentProcessorService.extract()`: calls out to Claude to OCR/classify a document file.
- `document-pairing.service.ts` — `DocumentPairingService`: auto-pairs INVOICE + RECEIPT `ExtractedDocument` rows from the same supplier/invoice number (`pairInvoicesAndReceiptsForBusiness`, `unpair`).
- `documents.controller.ts` — `DocumentsController` at route `documents`, gated by `FirebaseAuthGuard` + `SubscriptionGuard` + `RequireModule(INVOICES)`.

## Main flows
- `POST /documents/create-doc`, `POST /documents/preview-doc` — validate + transform a `CreateDocDto`, persist header/lines/payments, generate PDF, post a journal entry (via bookkeeping) for revenue-generating types.
- `GET /documents/get-docs`, `GET /documents/get-doc-lines` — list/filter issued documents.
- `GET|POST /documents/get-setting-doc-by-type/:typeDoc`, `setting-initial-index` — manage per-business running-number counters.
- `POST /documents/rollback`, `POST /documents/finalize-allocation`, `PATCH /documents/update-status` — document lifecycle/allocation-number operations.
- `POST|GET|DELETE /documents/save-draft|load-draft|delete-draft` — draft persistence.
- `POST /documents/me/process-inbox` — scans a business's Drive inbox folder, OCRs new files via `DocumentProcessorService`, dedupes by content hash, runs pairing, moves processed files.
- `POST /documents/me/ocr-file` — OCR a single uploaded file on demand.
- `GET /documents/me/catalog`, `GET /documents/me/review` — build the review UI's list of extracted/matched documents.
- `POST /documents/me/archive/:documentId` — archive a reviewed `ExtractedDocument`.

## Related topics
- bookkeeping (`JournalEntry`/`JournalLine`/`DefaultBookingAccount`, `BookkeepingService` — journal entries posted for issued documents)
- expenses (`Expense`, `Supplier`, `DefaultSubCategory`, `UserSubCategory` — OCR'd documents become expenses)
- transactions (`SlimTransaction` — matching extracted documents to bank transactions; legacy `Transactions` registered only for `SharedService`)
- business (`Business`, `BusinessService` — per-business folders and settings)
- users (`UsersModule`, `User` entity)
- billing (`BillingModule` — subscription/module gating)
- google-drive (`GoogleDriveModule` — inbox scanning, file move/download)
- mail (`MailModule`)
- shared (`SharedService`, `FxRateService`/`FxRate` — currency normalization for non-ILS OCR'd documents)
- delegation (`Delegation` entity registered in module)
- demo-data (depends on this module: `DocumentsService.createDoc` used to seed demo income documents)
