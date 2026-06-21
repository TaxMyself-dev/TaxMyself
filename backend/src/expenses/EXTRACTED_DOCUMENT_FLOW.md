# Extracted Document → Expense Flow

End-to-end map of how a PDF/image lands in Drive, gets OCR'd into a row,
shows up in the review modal, and becomes an `expense` row. Read this
before touching anything in the OCR / review / approve chain — most of
the names and invariants are non-obvious and have bitten us in prod
before.

---

## Mental model

```
Drive inbox/                         extracted_documents               expense
─────────────                        ────────────────────              ───────
[PDF dropped] ──OCR──▶ row(PENDING_REVIEW) ──user approves──▶  Expense row
                                                                  │
                                                                  └─ source_document_id → ExtractedDocument.id
```

Three actors:
- **Google Drive** — file storage, polled per business.
- **extracted_documents** — staging table. One row per OCR'd invoice
  (a single PDF can produce multiple rows when it bundles invoices).
- **expense** — final accounting row, the source of truth for VAT/P&L.

A single drive file → 1+ extracted_document rows → 0 or 1 expense rows
(0 when the user archives/rejects, or when a pair's secondary half rides
on the primary's expense).

---

## Tables / entities

### `extracted_documents` — [extracted-document.entity.ts](./../documents/extracted-document.entity.ts)

Staging row. Lives until the user resolves it.

Critical columns:
- `status` — `ExtractedDocStatus` enum:
  - `PENDING_REVIEW` (default after OCR)
  - `APPROVED` (became an Expense; row stays for traceability)
  - `ARCHIVED` (user kept for audit, doesn't claim)
  - `REJECTED` (junk / OCR error / duplicate)
  - `PAIRED` (secondary half of an invoice↔receipt pair — see Pairing)
  - `ERROR` (OCR failed; row exists so the file isn't re-OCR'd forever)
- `document_type` — `ExtractedDocumentType` enum: `invoice`, `receipt`,
  `tax_invoice_receipt`, `credit_invoice`, `invoice_receipt_pair`,
  `form_106`, `tax_form`, `contract`, `unknown`.
- `invoice_number` — the invoice number printed on the doc.
  **For RECEIPTS this is the invoice number the receipt REFERENCES,
  not the receipt's own receipt-number** — the OCR prompt enforces
  this so the pairing service can match. See `USER_TRAILER` in
  [document-processor.service.ts](./../documents/document-processor.service.ts).
- `allocation_number` — Israeli מספר הקצאה, **strictly 9 digits**.
  Normalized in `documents.service.ts:normalizeAllocationNumber` —
  strips non-digits, returns the rightmost 9 when longer.
- `amount` / `vat` / `amount_before_vat` — in the doc's OWN currency.
- `currency` — ISO-4217 (defaults to `ILS` when OCR can't tell).
- `ilsAmount` / `fxRateToIls` — pre-converted ILS using the BOI rate
  for the doc's date. Populated by `FxRateService` at OCR-time.
- `pairedWithDocumentId` — set by the pairing service when this row
  is paired with another. Pair direction: the **receipt is primary**,
  the invoice is secondary (status=PAIRED).
- `confirmedExpenseId` — set when the user approves, links back to
  the resulting `expense.id`.
- `drive_file_id` / `drive_file_name` — Drive identity. Dedup key
  for "don't re-OCR a file we already processed".

### `expense` — [expenses.entity.ts](./expenses.entity.ts)

Final approved row. Carries everything needed for VAT/P&L reporting.

Confusing-name landmines:
- **`expenseNumber` actually means `invoiceNumber`.** It's the OCR'd
  invoice number, NOT a separate user-entered reference. Populated
  by the approve paths from `doc.invoiceNumber`. Worth a rename
  one day — until then, the comment at each call site flags it.
- `sourceDocumentId` (DB col `source_document_id`) — links back to
  the `extracted_documents` row this Expense was approved from.
  Used by un-approve and audit.
- `externalTransactionId` — links to the slim_transactions row when
  the approve was a "matched" row (doc + bank tx).

### `supplier` — [suppliers.entity.ts](./suppliers.entity.ts)

Per-business master list of vendors.

- Dedup: `UNIQUE(businessNumber, supplierID)` — declared on the
  entity AND enforced in prod via index `uq_supplier_business_supplierid`.
- NULL `supplierID` is allowed and treated distinct (foreign vendors
  with no Israeli tax ID can coexist).
- Auto-created by `expenses.service.ts:addExpense` (lines ~160-210)
  on every Expense save, **find-or-create per business** — NOT per
  user. A user with two businesses gets one supplier row per business.
- Auto-create skips when `supplierID` is empty (no reliable key).
- `saveAsSupplier=false` skips it entirely — the review modal sets
  this when the user clicks the red flag icon on a row.

### `business` — [business.entity.ts](./../business/business.entity.ts)

Stores the three Drive folder IDs per business:
- `driveFolderId` — root for this business
- `driveInboxFolderId` — where users drop files
- `driveProcessedFolderId` — where files land after OCR success

The old `driveArchiveFolderId` was removed — `extracted_documents.status`
is now the source of truth for archived/rejected rows; files stay in
`processed/` regardless.

---

## Flow 1: Drive → extracted_documents (OCR)

**Trigger:** the report-page preview flow (`previewCheck`) or the
explicit `pull-drive-docs-dialog` UI calls
`documents.service.ts:extractFromDrive` (or similar entry point).

**Process** ([documents.service.ts](./../documents/documents.service.ts)):
1. List files in the business's `driveInboxFolderId`.
2. For each file, check `extracted_documents` for an existing row
   with that `drive_file_id` — skip if found (idempotent re-runs).
3. Download the file, send to Claude API via
   [document-processor.service.ts](./../documents/document-processor.service.ts).
4. Parse the model's JSON (one or more invoices per file).
5. For each invoice:
   - Normalize fields (`normalizeAllocationNumber`,
     `normalizeCurrency`, `normalizeDocumentType`)
   - Resolve FX rate via `FxRateService` if currency ≠ ILS
   - Insert a row with `status=PENDING_REVIEW`
6. On OCR success, move the file inbox/ → processed/ via
   `googleDriveService.moveFile`. **Failure to move is logged but
   doesn't fail the OCR** — the file ID is now in
   `extracted_documents` so re-listing inbox won't re-OCR it.

**Caching invariant:** the prompt uses two cached system blocks
(instructions + catalog). The catalog block sorts entries by
`subCategoryName` alphabetically — changing iteration order
silently busts the cache and burns tokens. See `buildCatalogBlock`.

## Flow 2: Pairing

[document-pairing.service.ts](./../documents/document-pairing.service.ts)

After OCR, the pairing service tries to match receipts with their
referenced invoices. Match key:
- **Primary:** `(supplierID, invoice_number)` — both non-empty.
- **Fallback:** `(supplier_name, invoice_number)` when supplierID
  is empty (foreign vendors like Anthropic have no Israeli tax ID).

When a match is found:
- The **receipt** stays `PENDING_REVIEW` (it's the primary —
  carries the proof of payment).
- The **invoice** flips to `PAIRED` (secondary — won't show in
  the review modal independently).
- Both rows get `pairedWithDocumentId` set to the other's id.

On approve (next flow), the primary's approve cascades to the
secondary so both rows flip to APPROVED together.

## Flow 3: Review modal (frontend)

[report-review-dialog.component.ts](./../../../frontend/src/app/components/report-review-dialog/report-review-dialog.component.ts)

**Entry:** vat-report.page.ts / pnl-report.page.ts call
`reportReviewService.previewCheck` when the user clicks הצג or submits.
`previewCheck` returns `{hasPendingDocs, hasUnconfirmedExpenses, counts}`.
If either flag is true → open this modal before showing the report.

**What the user sees:**
- Three row types interleaved:
  - `matched` — doc + bank tx, will commit as ONE Expense
  - `doc_only` — cash receipt (no tx), commits as Expense
  - `tx_only` — bank tx with no doc, commits as Expense
- Inline edits: category, sub-category, vat%, tax%, period.
- **Cascade by supplier**: editing category/sub-category on one row
  propagates to siblings sharing the same supplierId (or, when
  supplierId is empty, the same trimmed supplier name with NO id
  on either side). Siblings paint blue (`row-highlighted` class).
- **Red flag icon** (`ספק חדש` rows only): toggles
  `saveAsSupplier`. Click to opt this row out of supplier-master
  auto-create on approve.
- **Period dropdown**: derived from the doc date + business cadence;
  "אחר" opens the styled custom-period dialog.

**Pre-flight on bulk approve (`bulkApproveSelected`):**
- `findSupplierConflicts` — if multiple selected rows share the
  same NEW supplierId but have divergent category/sub/vat/tax/
  isEquipment, surface a blocking dialog. Only the first row would
  reach the supplier master (find-or-create), so divergent rows
  would lose their edits silently. User must align values or click
  the flag on divergent rows.

## Flow 4: Approve → expense

Three service methods, all in
[report-review.service.ts](./../reports/report-review.service.ts):

| Method | Row type | Source |
|---|---|---|
| `approveMatched` | `matched` | doc + slim_transaction |
| `approveDocCash` | `doc_only` | doc (cash receipt) |
| `approveTxNoDoc` | `tx_only` | slim_transaction only |

All three:
1. Resolve final values via `overrides ?? doc/slim` precedence.
2. Compute ILS amount via `buildExpenseAmountFromDoc` (uses doc's
   `ilsAmount` for foreign currency, signs based on amount).
3. Call `expensesService.addExpense(dto, firebaseId, businessNumber, saveAsSupplier)`.
4. Update `expense.sourceDocumentId` and **always** stamp `vatReportingDate`
   (override `?? buildReportPeriodLabel(businessType, vatReportingType, date)`).
   `addExpense` does NOT compute the period itself — see gotcha #8.
5. Mark the source doc as `APPROVED` with `confirmedExpenseId`.
6. Cascade the same to `pairedWithDocumentId` if set.

**`pnlCategory` is NOT stamped on approve — it's an override-only slot.**
It stays NULL at creation and is resolved live everywhere it's read:
`expense.pnlCategory ?? subCategoryMap ?? bookkeeping category` — both the P&L
report (`reports.service.ts`) and the bookkeeping display
(`expenses.service.ts:getExpensesForVatReport`). NULL therefore means "inherit"
and automatically tracks later subcategory→P&L map edits; a non-null value
means the user explicitly chose a P&L category for that one expense via the
expenses page Edit dialog. Stamping a resolved default at approve time would
freeze the value and defeat the live mapping, so we don't.

`addExpense` ([expenses.service.ts:~50-210](./expenses.service.ts)):
- Saves Expense row.
- Auto-registers Supplier per business (find-or-create on
  `(businessNumber, supplierID)`), unless `saveAsSupplier=false` OR
  `supplierID` is empty.
- ConflictException on duplicate detection (same supplier + date
  + sum within tolerance).
- ER_DUP_ENTRY from the supplier unique index → debug-logged, not
  surfaced as failure (the Expense is already committed).

## Flow 5: Drive folder lifecycle on approve

- On OCR success: file moves inbox/ → processed/ (Flow 1, step 6).
- On user approve / archive / reject: **file stays in processed/**.
  `extracted_documents.status` is the source of truth from that
  point on. Old code had an `archive/` folder; removed.

## Flow 6: Drive folder provisioning

[users.service.ts:provisionDriveStructure](./../users/users.service.ts)

Runs on every `freshLogin=true` sign-in.

Key invariant: **deferred wipe**. The stale-root check (parent of
user folder ≠ current `GOOGLE_DRIVE_ROOT_FOLDER_ID`) sets an
in-memory `userFolderIsStale = true` flag. The new folder is created
FIRST, then the DB row is overwritten in a single write. If creation
throws, the row keeps the stale-but-real ID — never NULL. Same
pattern for per-business folders.

`createUserFolder` / `ensureBusinessFolder` / `ensureInboxAndProcessed`
are all **find-or-create by (name, parent)** — repeat calls return
existing folder IDs, never duplicates.

---

## Common gotchas

1. **`expenseNumber` ≠ user reference**. It's the invoice number,
   under a misleading name. The `expense` table has no
   `invoiceNumber` column.

2. **DB schema drift**. Dev uses TypeORM `synchronize`, prod is
   manual. When you add/change a column, the entity reflects it
   immediately in dev but prod stays stale until ALTER. Audit
   `information_schema.COLUMNS` if you hit a "Field X doesn't
   have a default value" error in prod.

3. **Cache invalidation on the OCR prompt**. Anthropic prompt cache
   is a prefix BYTE match — any change to instruction text OR the
   catalog block's iteration order silently busts the cache.

4. **Per-business vs per-user dedup**. Suppliers are per-business
   (a user with 2 businesses gets 2 supplier rows for the same
   vendor). The list endpoint scopes by businessNumber to match.
   Don't reintroduce userId-scoped lookups.

5. **`saveAsSupplier` semantics**. `false` skips the supplier
   master write but the Expense still gets created. UI shows the
   red flag toggle ONLY for `ספק חדש` rows — for known suppliers
   the flag is meaningless (find-or-create skips on existing).

6. **Date hydration**. TypeORM may hand back a `DATE` column as
   `string` instead of `Date` depending on the driver version.
   Wrap with `new Date(...)` before calling `.getMonth()`. The
   approve paths do this defensively.

7. **Pairing edge case**. `bulkConfirmFromDrive` in
   `expenses.service.ts` is legacy / no longer called by the
   frontend — the active flow goes through `report-review.service.ts`.
   Don't add features to the legacy path.

8. **`addExpense` does not stamp `vatReportingDate`**. It computes
   totals, scope, supplier — but NOT the period. The approve paths in
   `report-review.service.ts` own that: each resolves
   `overrides.reportPeriod ?? buildReportPeriodLabel(...)` and writes it
   on the Expense (and the slim row, when there is one) right after
   `addExpense` returns. If you add a new approve/save path, replicate
   this or the row lands with a NULL period and only date-range
   filtering will find it.

---

## Quick "where do I add X?" pointers

- **New OCR field**: extracted-document.entity.ts (DB col) →
  document-processor.service.ts (`ExtractedFields` + prompt) →
  documents.service.ts (the two persist call sites).

- **New review-modal column**: report-review-dialog.component.ts
  `buildColumns()` + EditableReviewRow interface.

- **New approve-time field on Expense**: expenses.entity.ts →
  the three approve* methods in report-review.service.ts (pass
  the value into addExpense's dto).

- **New supplier-conflict comparison field**:
  `findSupplierConflicts` in report-review-dialog.component.ts.

- **New status / document_type enum value**:
  extracted-document.entity.ts enum + every `switch`/`?:`/`where`
  that exhaustively lists the old values (use grep on the existing
  values).
