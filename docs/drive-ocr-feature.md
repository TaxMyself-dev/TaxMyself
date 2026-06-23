# Google Drive + Claude OCR Feature

End-to-end flow that auto-creates a Drive folder per user and per business,
syncs uploaded invoice files through Claude OCR, and lets the user review and
confirm the extracted data as `Expense` rows.

---

## High-level flow

```
Signup
  └─ background: provisionDriveStructure (user folder + per-business folders + 2-yr scaffold)

Login (freshLogin)
  └─ background: provisionDriveStructure (idempotent backfill)

Add a new business
  └─ background: provisionDriveForNewBusiness → provisionDriveStructure

User uploads files to:  <root>/<user name>/<business name>/<YYYY>/<MM>/

User clicks "משוך מסמכים מ-Drive" on the expenses page
  ├─ POST /documents/me/sync          (per month: download → Claude → save rows)
  ├─ GET  /documents/me/review        (rows joined with Supplier, filter unconfirmed)
  └─ GET  /documents/me/catalog       (sub-categories for dropdowns)
       │
       ▼
  Dialog: editable table + file preview pane
       │
       └─ POST /expenses/bulk-confirm-from-drive
              ├─ per row: addExpense (using DTO.isEquipment when set)
              ├─ optional supplier upsert
              └─ mark extracted_document.confirmed_expense_id
```

---

## Drive folder layout

```
<root folder>/                                ← env: GOOGLE_DRIVE_ROOT_FOLDER_ID
  <Full name>/                                ← user.drive_folder_id
    <Business name>/                          ← business.drive_folder_id
      2025/
        01/ 02/ ... 12/
        דוח שנתי/
      2026/
        01/ 02/ ... 12/
        דוח שנתי/
```

- Year + month folders are created lazily on first sync (`getOrCreateMonthFolder`).
- Both years (`current` and `current - 1`) get scaffolded eagerly when the
  business folder is first created.
- "דוח שנתי" is a placeholder folder for annual-report attachments — not
  swept by the OCR sync.

---

## Configuration (`.env`)

| Var | Purpose |
|---|---|
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | The shared "KeepInTax-Clients-Dev/Prod" parent folder. Service account is shared as Editor on it. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full Service Account JSON on a **single line** (`\n` inside `private_key` stays as literal `\n` — `JSON.parse` decodes it). |
| `ANTHROPIC_API_KEY` | Claude API key. Lazy-init — backend boots even if missing. |

The service account is `keepintax-drive@taxmyself-prod.iam.gserviceaccount.com`
(Editor on the root folder, shares each user folder with the user's email as Writer).

---

## Database

### `user` (existing entity)
- New column: `drive_folder_id VARCHAR(255) NULL`

### `business` (existing entity)
- New column: `drive_folder_id VARCHAR(255) NULL`

### `extracted_document` (new entity → `ExtractedDocument`)
One row per **invoice extracted from a Drive file**. A multi-invoice file
(e.g., monthly fuel statement) creates **multiple rows** with `sub_index` 0..N-1.

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK | |
| `user_id` | INT | numeric `user.index` |
| `business_number` | VARCHAR(32) | nullable for legacy rows |
| `drive_file_id` | VARCHAR(255) | unique with `sub_index` |
| `sub_index` | INT NOT NULL DEFAULT 0 | position within multi-invoice file |
| `drive_file_name` | VARCHAR(512) | refreshed on re-sync |
| `month` | VARCHAR(7) | `YYYY-MM` |
| `supplier` | VARCHAR(255) | Claude extraction |
| `supplier_id` | VARCHAR(32) | Israeli ח.פ. / עוסק מורשה — digits only |
| `date` | DATE | `YYYY-MM-DD` |
| `invoice_number` | VARCHAR(128) | |
| `allocation_number` | VARCHAR(64) | מספר הקצאה |
| `amount` / `vat` / `amount_before_vat` | DECIMAL(12,2) | |
| `category` / `sub_category` | VARCHAR | from catalog (Claude picks) |
| `tax_percent` / `vat_percent` | DECIMAL(6,2) | from catalog |
| `is_equipment` | BOOLEAN NULL | from catalog (drives depreciation) |
| `description` | TEXT | brief Hebrew description |
| `status` | ENUM('pending','processed','error') | |
| `raw_response` | TEXT NULL | full Claude output, on `sub_index=0` only |
| `confirmed_expense_id` | INT NULL | set when user confirms → excludes from review |
| `created_at` / `updated_at` | TIMESTAMP | auto |

Indexes:
- `(user_id, business_number, month)` — fast review queries
- `(drive_file_id, sub_index)` UNIQUE — multi-invoice file idempotency

---

## Backend services

### `GoogleDriveService` — `src/google-drive/google-drive.service.ts`
Lazy-initialized Drive API client. Methods:
- `createUserFolder(name, email)` — creates root folder, shares with email as Writer (no notification).
- `ensureBusinessFolder(parentId, businessName)` — creates business sub-folder with 2-year scaffold.
- `getOrCreateMonthFolder(parentId, "YYYY-MM")` — navigates `parent → YYYY → MM`.
- `getFolderUrl(id)` — Drive folder URL.
- `shareFolder(id, email, role)` — share to user.
- `folderExists(id)` — verifies folder is alive (not deleted/trashed).
- `listFolderFiles(parentId)` — paginated, excludes folders + trashed.
- `downloadFile(id)` — `alt: 'media'` + `arraybuffer` → `Buffer`.

### `DocumentProcessorService` — `src/documents/document-processor.service.ts`
Lazy-initialized Anthropic client. Single public method:
- `extract(buffer, mimeType, catalog)` — builds prompt with catalog, sends file
  (PDF or supported image) + prompt to Claude (Sonnet 4.6), parses returned
  `{ invoices: [...] }` array.
- Defensive JSON parsing: handles unfenced JSON, ```json fences``` wrapped in
  prose, and brace-fallback extraction.
- `max_tokens: 8192` to handle long multi-invoice statements.

### `DocumentsService` — `src/documents/documents.service.ts`
**Drive-OCR methods (at the end of the file):**
- `buildExtractionCatalog(firebaseId, businessNumber)` — unions `DefaultSubCategory`
  with `UserSubCategory` for this user/business, filtered to `isExpense=true`.
  Used as the prompt catalog AND served to the frontend dropdowns.
- `syncUserMonth(userIndex, businessNumber, yearMonth)` — for one (user, business,
  month): resolves folder structure, lists files, skips processed rows, deletes
  stale error rows, re-extracts, saves N rows per file.
- `syncMonthsForUser(firebaseId, businessNumber, months[])` — iterates months
  sequentially (Drive + Claude rate limits).
- `getReviewableForUser(firebaseId, businessNumber, months[])` — fetches
  processed-and-unconfirmed rows; joins with `Supplier` by `supplierID`.
- `ensureBusinessFolderForUser(user, businessNumber)` — Layer 2 verification
  (calls `folderExists` for user folder + business folder, recreates if stale).

### `UsersService` additions — `src/users/users.service.ts`
- `provisionDriveStructure(user)` — Layer 2-verified user folder + iterate
  businesses creating business folders + scaffold. Best-effort, idempotent.
  Called fire-and-forget from signup, fresh login, and the dev endpoint.
- `buildDriveFolderName(user)` — `"fName lName"` or `email` or `user-firebaseId`.
- `getDriveProvisioningStatus(firebaseId)` — DB-only snapshot for the login banner.

### `BusinessService` additions — `src/business/business.service.ts`
- `createBusiness` now fires `provisionDriveForNewBusiness(firebaseId)` after
  saving — reuses `UsersService.provisionDriveStructure` (idempotent — only
  creates the new business's folder).

### `ExpensesService` additions — `src/expenses/expenses.service.ts`
- `bulkConfirmFromDrive(firebaseId, businessNumber, items[])` — per-item:
  1. Build `CreateExpenseDto` (now includes `isEquipment`).
  2. Call `addExpense` — DTO's `isEquipment` wins when explicitly set.
  3. If `saveAsSupplier && supplierID` and supplier doesn't exist, upsert.
  4. Set `extracted_document.confirmed_expense_id`.
  - Per-row best-effort; one failure doesn't abort the batch.
- `addExpense` now respects DTO `isEquipment` when defined — solves a
  longstanding constraint that previously only allowed the parent category
  literally `"רכוש קבוע"` to mark equipment.

---

## Endpoints

### User-facing (FirebaseAuthGuard)
| Method | Path | Body / Query | Purpose |
|---|---|---|---|
| `POST` | `/documents/me/sync` | `{ businessNumber, months[] }` | Sync N months for current user/business |
| `GET` | `/documents/me/review` | `?businessNumber=X&months=...` | Review-ready rows (joined with Supplier) |
| `GET` | `/documents/me/catalog` | `?businessNumber=X` | Sub-category catalog for dropdowns |
| `POST` | `/expenses/bulk-confirm-from-drive` | `{ businessNumber, items[] }` | Confirm selected rows as Expense, optionally upsert Supplier |
| `GET` | `/users/me/drive-folder` | — | Folder id + URL for the caller |

### Admin/dev
| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/dev/drive/create-folder/:userId` | none | Provision full Drive structure for one user; recovers stale ids. **Remove before prod.** |
| `POST` | `/documents/sync/:userId/:businessNumber/:yearMonth` | none | Manual sync trigger (admin clients-dashboard uses this) |
| `GET` | `/documents/:userId/:businessNumber/:yearMonth` | none | Manual list (admin uses this) |

---

## Frontend

### `PullDriveDocsDialogComponent` — `src/app/components/pull-drive-docs-dialog/`
Standalone component used on the bookkeeping → expenses page.
- Takes `visible` and `businessNumber` inputs.
- Period selector reuses `PeriodSelectComponent` with `MONTHLY` / `BIMONTHLY` / `ANNUAL`.
- Loads catalog in parallel with sync (cached for the dialog's lifetime).
- Inline-editable rows: supplier, supplier ID, allocation #, date, sum, category dropdown,
  cascading sub-category dropdown, % VAT, % tax.
- Row states (additive tints):
  - **Matched** (green) — supplier known, all critical fields present.
  - **Problematic** (amber) — missing supplier / date / sum / sub-category.
  - **Equipment** (purple left-border + `pi-desktop` badge).
  - **Save failed** (red) — overrides all tints.
- File preview iframe (`/preview` endpoint) opens on eye-icon click.
- Bulk confirm: per-row outcome reported back; successful rows fall out of the list.

### `DriveDocsService` — `src/app/services/drive-docs.service.ts`
HTTP wrapper for the user-facing endpoints. Typed `ReviewableExtractedDoc`,
`ConfirmFromDriveItem`, `BulkConfirmResponse`, `SubCategoryCatalogEntry`.

### Other frontend touchpoints
- `expenses.page.html` — "משוך מסמכים מ-Drive" button + dialog mount.
- `expenses.page.ts` — `selectedBusinessNumber()` passed to dialog.
- `generic-table.component.html` — new `ICellRenderer.TAX_WITH_EQUIPMENT`
  renderer; renders `% מס` plus the `pi-desktop` icon when `row.isEquipment`.
- `clients-dashboard.component` — admin "משוך מסמכים" dialog (sync + view rows
  for any user) — uses `AdminPanelService.syncUserDriveMonth` /
  `getUserExtractedDocs`.
- `category-management.component.html` — admin sub-category form: inline checkbox
  row (`ציוד / מוכר / הוצאה`), dynamic `% מס` ↔ `אחוז פחת` label, `% הנחה` removed.

---

## Behavior matrix

### Sync idempotency
| File state | Sync action |
|---|---|
| Never seen | Extract, save N rows (one per invoice in the file) |
| All prior rows `error`/`pending` | Delete prior rows, re-extract, save N rows |
| Any prior row `processed` | Skip entirely (file already done; user can manually delete rows to force re-extract) |
| Claude returns `{ invoices: [] }` | Save 1 error row with raw response |
| Claude returns non-JSON | Save 1 error row with raw text |

### Equipment classification
| Source | Used when |
|---|---|
| Catalog (DefaultSubCategory ∪ UserSubCategory) | Claude classifies the invoice; result persisted on `extracted_document.is_equipment` |
| Matched supplier's `isEquipment` | NOT used — equipment-ness is a sub-category property, not a supplier property |
| Bulk-confirm DTO `isEquipment` | Wins in `addExpense` — explicit value overrides legacy category-name check |

### Provisioning lifecycle
| Event | Result |
|---|---|
| Signup with N businesses | Response returns instantly. Background scaffolds user + N business folders. |
| Add business via `POST /business/create` | Response returns instantly. Background creates the new business's folder. |
| Fresh login | Background `provisionDriveStructure` (idempotent — no-op if everything exists). |
| Click "משוך נתונים" | Lazy `ensureBusinessFolderForUser` fills any gap before walking files. |
| Folder deleted in Drive | `folderExists` detects on next provisioning OR next sync; stale id nulled; folder re-created. |

---

## Operations / dev workflow

### Reset for fresh sync test
```sql
DELETE FROM extracted_document;
```
Files in Drive untouched, folder ids untouched. Next sync re-runs Claude on every file.

### Re-create folder structure too
```sql
UPDATE `user` SET drive_folder_id = NULL WHERE `index` = 6;
UPDATE business SET drive_folder_id = NULL WHERE firebaseId = '<fid>';
DELETE FROM extracted_document WHERE user_id = 6;
```
Optional: delete the actual Drive folders manually before sync. Next sync re-provisions everything.

### When TypeORM `synchronize` is off (`NODE_ENV=production`)
Use the SQL in `backend/scripts/migrations/2026-05-26_add_drive_folder_id_to_user.sql`
plus equivalents for `business.drive_folder_id` and the new `extracted_document` columns
(see `extracted-document.entity.ts` for the canonical list).

**Recommended dev flow**: `npm start` (which uses `nest start`, respects `.env`'s
`NODE_ENV=development`, runs synchronize). The misleadingly-named `npm run start:dev`
hardcodes `NODE_ENV=production` and skips synchronize.

---

## Known caveats / future work

1. **`DocumentsService` is large.** OCR/sync logic at the bottom of the file
   conceptually belongs in a dedicated `DocumentOcrService`. Split when time allows.
2. **Sub-category fallback.** If the catalog (`DefaultSubCategory` + `UserSubCategory`)
   is empty for a business, Claude returns null for `sub_category` and the dialog's
   dropdown shows no options. Make sure the default catalog is seeded.
3. **`reductionPercent` is hidden from the category-management UI** but the column
   still exists in `Supplier` / `DefaultSubCategory` / `UserSubCategory`. The OCR
   flow stores 0 for it. Other parts of the app may still read it.
4. **Dev endpoint** (`POST /auth/dev/drive/create-folder/:userId`) is unauthenticated
   and marked `// TODO: remove before production`. Delete the controller method when shipping.
5. **Admin endpoints** (`POST /documents/sync/:userId/...`, `GET /documents/:userId/...`)
   are unauthenticated. Either add `FirebaseAuthGuard` + admin role check, or restrict
   to a separate admin module.
6. **`addExpense`'s legacy "category must be רכוש קבוע" rule** still applies when the
   DTO doesn't send `isEquipment` (manual entry path). Consider unifying so all paths
   trust the sub-category catalog.
7. **`/documents/me/sync` is sequential per month.** For ANNUAL period this is 12
   round trips × multiple Claude calls per file. Acceptable for now; if it becomes
   slow, consider a background job + status polling.
