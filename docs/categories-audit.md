# Categories & Accounting Architecture Audit

Read-only discovery snapshot of the current category/subcategory/bookkeeping
system, produced before a planned redesign to a two-table (Category,
SubCategory) model with multi-owner support (SYSTEM/ACCOUNTANT/CLIENT) and
expense-level snapshots. No code was changed to produce this document.

Repo: `taxmyself-dev`, backend = NestJS + TypeORM (MySQL), frontend = Angular.
Audited at commit `6ffa67f3` (main), 2026-07-10.

---

## 1. Data model (verbatim)

### 1.1 `DefaultCategory` — table `default_category`
`backend/src/expenses/default-categories.entity.ts`

```ts
@Entity()
export class DefaultCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  categoryName: string;

  @Column('boolean')
  isExpense: boolean;

  /**
   * Category-level bookkeeping account code (→ default_booking_account.code).
   * Fallback in resolveAccountCode when a sub-category has no accountCode of
   * its own. NULL ⇒ category too broad to map; resolver falls back to '5000'.
   * Seeded on boot by AccountSeedService.
   */
  @Column({ nullable: true })
  accountCode: string;

}
```
No `@Entity('name')` override → TypeORM's default naming strategy snake-cases
the class name → table is `default_category` (confirmed by raw SQL in
`AccountSeedService` referencing `default_category` directly). No pending
alterations in any migration file (see §1.7).

### 1.2 `DefaultSubCategory` — table `default_sub_category`
`backend/src/expenses/default-sub-categories.entity.ts`

```ts
@Entity()
export class DefaultSubCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  subCategoryName: string;

  @Column()
  categoryName: string;

  @Column('decimal', { precision: 5, scale: 2 })
  taxPercent: number;

  @Column('decimal', { precision: 5, scale: 2 })
  vatPercent: number;

  @Column('decimal', { precision: 5, scale: 2 })
  reductionPercent: number;

  @Column('boolean')
  isEquipment: boolean;

  @Column('boolean')
  isRecognized: boolean;

  @Column('boolean')
  isExpense: boolean;

  @Column({ type: 'enum', enum: ExpenseNecessity, default: ExpenseNecessity.IMPORTANT })
  necessity: ExpenseNecessity;

  /** Does this subcategory go to the P&L or only to the annual report. */
  @Column({ type: 'enum', enum: ExpenseReportScope, default: ExpenseReportScope.PNL })
  reportScope: ExpenseReportScope;

  /** P&L presentation category override (NULL ⇒ use the bookkeeping category). */
  @Column({ type: 'varchar', nullable: true, default: null })
  pnlCategory: string | null;

  /**
   * Bookkeeping account code for journal posting (→ default_booking_account.code).
   * Populated on boot by AccountSeedService from pnlCategory; NULL ⇒ caller
   * falls back to '5000'.
   */
  @Column({ nullable: true })
  accountCode: string;

  /**
   * Sub-ledger account code nested under `accountCode` (e.g. '5101' under
   * parent '5100'). Populated on boot by AccountSeedService.seedSubAccountCodes
   * from SUBCATEGORY_SUB_ACCOUNT_CODES; NULL when unmapped.
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  subAccountCode: string | null;

}
```
Table: `default_sub_category`. `categoryName` is a **plain string**, not an
FK to `default_category.id` — the (category, subCategory) pair is joined by
name only, everywhere in the codebase. No unique constraint on
`(categoryName, subCategoryName)` at the DB level (relied on only by
application-level `findOne`/existence checks in `AccountSeedService`).

### 1.3 `UserCategory` — table `user_category`
`backend/src/expenses/user-categories.entity.ts`

```ts
@Entity()
export class UserCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  categoryName: string;

  @Column()
  firebaseId: string;

  @Column()
  businessNumber: string;

  @Column('boolean')
  isExpense: boolean;

  /**
   * User-level category account override (→ default_booking_account.code).
   * Checked in resolveAccountCode before the default category. NULL ⇒ no
   * override; resolver falls through to the default category / '5000'.
   */
  @Column({ nullable: true })
  accountCode: string;

}
```

### 1.4 `UserSubCategory` — table `user_sub_category`
`backend/src/expenses/user-sub-categories.entity.ts` — identical shape to
`DefaultSubCategory` plus `firebaseId`/`businessNumber`, minus `subAccountCode`
(no per-business override exists for sub-ledger numbering):

```ts
@Entity()
export class UserSubCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firebaseId: string;

  @Column()
  businessNumber: string;

  @Column()
  subCategoryName: string;

  @Column()
  categoryName: string;

  @Column('decimal', { precision: 5, scale: 2 })
  taxPercent: number;

  @Column('decimal', { precision: 5, scale: 2 })
  vatPercent: number;

  @Column('decimal', { precision: 5, scale: 2 })
  reductionPercent: number;

  @Column('boolean')
  isEquipment: boolean;

  @Column('boolean')
  isRecognized: boolean;

  @Column('boolean')
  isExpense: boolean;

  @Column({ type: 'enum', enum: ExpenseNecessity, default: ExpenseNecessity.IMPORTANT })
  necessity: ExpenseNecessity;

  @Column({ type: 'enum', enum: ExpenseReportScope, default: ExpenseReportScope.PNL })
  reportScope: ExpenseReportScope;

  @Column({ type: 'varchar', nullable: true, default: null })
  pnlCategory: string | null;

  @Column({ nullable: true })
  accountCode: string;

}
```

### 1.5 `Expense` — table `expense`
`backend/src/expenses/expenses.entity.ts` (full, 156 lines) — key columns:

```ts
@Entity()
export class Expense {
  @PrimaryGeneratedColumn() id: number;
  @Column() supplier: string;
  @Column({ nullable: true, default: null }) supplierID: string;
  @Column() category: string;               // ← plain string, no FK
  @Column() subCategory: string;             // ← plain string, no FK
  @Column('decimal', { precision: 10, scale: 2 }) sum: number;
  @Column('decimal') taxPercent: number;
  @Column('decimal') vatPercent: number;
  @Column('date') date: Date;
  @Column() businessNumber: string;
  @Column({ nullable: true, default: null }) note: string;
  @Column({ nullable: true, default: null }) file: string;
  @Column('boolean') isEquipment: boolean;
  @Column() userId: string;
  @Column('date') loadingDate: Date;
  @Column({ nullable: true, default: null }) expenseNumber: string;
  @Column({ nullable: true, default: null }) reductionDone: number;
  @Column() reductionPercent: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) totalTaxPayable: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) totalVatPayable: number;
  @Column({ type: 'int', nullable: true, default: null }) transId: number;
  @Column({ type: 'varchar', nullable: true, default: null }) externalTransactionId: string | null;
  @Column({ name: 'source_document_id', type: 'int', nullable: true, default: null }) sourceDocumentId: number | null;
  @Column({ type: 'varchar', length: 3, nullable: true, default: null }) originalCurrency: string | null;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null }) originalSum: number | null;
  @Column({ type: 'varchar', nullable: true, default: null }) vatReportingDate: SingleMonthReport | DualMonthReport | null;
  @Column({ type: 'boolean', nullable: true, default: null }) isReported: boolean;
  @Column({ type: 'enum', enum: ExpenseReportScope, default: ExpenseReportScope.PNL }) reportScope: ExpenseReportScope;
  /** Per-expense P&L-category override. Resolution precedence documented as:
   *  this → subcategory.pnlCategory → bookkeeping category.
   *  NOTE (see §5.2): this documented precedence is NOT what the P&L report
   *  actually implements today. */
  @Column({ type: 'varchar', nullable: true, default: null }) pnlCategory: string | null;
  @Column({ type: 'int', nullable: true, default: null }) journalEntryNumber: number | null;
}
```
Table `expense`. `category`/`subCategory` are **free-text strings copied at
expense-creation time** — no FK, no lookup validation against
`default_sub_category`/`user_sub_category` at write time.

### 1.6 `JournalEntry` / `JournalLine` — tables `journal_entry` / `journal_line`
`backend/src/bookkeeping/jouranl-entry.entity.ts` / `jouranl-line.entity.ts`
(full text; note the source filenames have a typo, "jouranl", the class
names do not):

```ts
@Entity()
export class JournalEntry {
  @PrimaryGeneratedColumn() id: number;               // global PK, NOT per-business
  @Column({ type: 'int', nullable: true }) entryNumber: number | null;  // per-business display number
  @Column() issuerBusinessNumber: string;
  @Column({ default: '' }) firebaseId: string;
  @Column({ type: 'date' }) date: string;
  @Column({ nullable: true }) description: string;
  @Column({ type: 'enum', enum: JournalReferenceType, nullable: true }) referenceType: JournalReferenceType;
  @Column({ type: 'bigint', nullable: true }) referenceId: number | null;
  @Column({ type: 'date', nullable: true }) valueDate: string;
  @Column({ type: 'date', nullable: true }) vatDate: string;
  @Column({ nullable: true }) notes: string;
  @Column({ type: 'varchar', nullable: true, default: null }) vatReportingPeriod: string | null;
  /** Sub-category name from the source expense. Null for income-document entries. */
  @Column({ nullable: true, default: null }) subCategory: string | null;
  @Column({ nullable: true, default: null }) counterAccountCode: string | null;
  @Column({ nullable: true, default: null }) subCounterAccountCode: string | null;
  @Column({ nullable: true, default: null }) counterPartyName: string | null;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null }) documentTotal: number | null;
  @CreateDateColumn() createdAt: Date;
}

@Entity()
export class JournalLine {
  @PrimaryGeneratedColumn() id: number;
  @Column() issuerBusinessNumber: string;
  @Column({ default: '' }) firebaseId: string;
  @Column() journalEntryId: number;
  @Column() lineInEntry: number;
  @Column() accountCode: string;                       // ← FK-by-string to default_booking_account.code
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) debit: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) credit: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) amountBeforeVat: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) vatAmount: number;
  @Column({ type: 'boolean', nullable: true, default: false }) isEquipment: boolean;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100 }) taxPercent: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100 }) vatPercent: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) amountForTax: number;
  /** Sub-category name from the source expense. Null on VAT lines and income-document lines. */
  @Column({ nullable: true, default: null }) subCategoryName: string | null;
}
```
`JournalLine.accountCode` is checked against `default_booking_account.code`
at *write* time only (`bookingAccountRepo.findOneByOrFail`, see §3) — there
is no DB-level FK constraint, `synchronize: true` in non-production
(`app.module.ts`) does not create one either.

### 1.7 Chart of accounts — `DefaultBookingAccount`, table `default_booking_account`
`backend/src/bookkeeping/account.entity.ts`:

```ts
@Entity()
export class DefaultBookingAccount {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) code: string;
  @Column() name: string;
  @Column() type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  /** Which P&L report line this account maps to. NULL = technical account. */
  @Column({ nullable: true }) pnlCategory: string | null;
  @Column({ nullable: true }) displayOrder: number | null;
}
```
The account codes **1000–6300** are defined as static data in
`backend/src/bookkeeping/account.seed.ts` (`DEFAULT_ACCOUNTS` array — 22
rows spanning technical/transfer 1000–1200, liabilities 2000–2410, income
4000/4010, expenses 5000–6300) and are upserted into `default_booking_account`
on every app boot by `AccountSeedService.onModuleInit` (`INSERT ... ON
DUPLICATE KEY UPDATE`, keyed on `code`). **This file (not a SQL script) is
the source of truth for the chart of accounts.**

**No `schema-changes.sql` file exists anywhere in the repository.** Pending
DB changes live as individually-dated files in `backend/scripts/migrations/`
(`2026-05-26_add_drive_folder_id_to_user.sql`,
`2026-05-30_drive_ocr_feature_schema.sql`,
`2026-06-01_billing_foundation_schema.sql`) — none of them touch
`default_category`, `default_sub_category`, `user_category`,
`user_sub_category`, `expense`, `journal_entry`, `journal_line`, or
`default_booking_account`.

### 1.8 Other entities carrying category/subCategory/accountCode strings

- **`Supplier`** (`backend/src/expenses/suppliers.entity.ts`, table
  `supplier`) — `category: string`, `subCategory: string` (both plain,
  no FK). Unique on `(businessNumber, supplierID)`. Used to prefill an
  expense's category on creation.
- **`ExtractedDocument`** (`backend/src/documents/extracted-document.entity.ts`,
  `@Entity('extracted_document')`) — OCR pipeline output:
  `category: string | null` (`varchar(64)`), `subCategory: string | null`
  (`varchar(128)`, column name `sub_category`). No `accountCode` column —
  account-code resolution happens later, downstream of the confirmed
  `Expense`, not on this entity.
- **`ClassifiedTransactions`** (`backend/src/transactions/classified-transactions.entity.ts`,
  table `classified_transactions`) — the bank/card auto-classification rules
  table: `category: string`, `subCategory: string` (plain, no FK), plus
  optional comment/sum-range/date-range refinement columns and
  `necessity`/`isExpense`/`isRecognized`/`vatPercent`/`taxPercent`/
  `isEquipment`/`reductionPercent`/`reportScope` — i.e. it duplicates the
  entire `DefaultSubCategory` shape as a denormalized snapshot per rule.
- **`Transactions`** (legacy, table `transactions`), **`SlimTransaction`**
  (table `slim_transactions`), **`FullTransactionCache`** (table
  `full_transactions_cache`) — each has its own `category: string | null` /
  `subCategory: string | null` pair, all plain strings, all independently
  writable.
- **`Documents` / `DocLines` / `DocPayments`** (issued/outbound documents) —
  **no** category/subCategory/accountCode columns; out of scope (they're
  revenue documents, always posted to fixed accounts 4000/4010/2400 — see §3).

---

## 2. Category referencing — precise answer

**There is no FK constraint anywhere in this system for category data.**
Every table that "references" a category or sub-category does so by copying
the **name as a string** at write time (`categoryName`/`category`,
`subCategoryName`/`subCategory`). There is no numeric FK id column pointing
at `default_category.id` or `default_sub_category.id` from `Expense`,
`Supplier`, `ExtractedDocument`, `ClassifiedTransactions`,
`SlimTransaction`, `FullTransactionCache`, or `Transactions`. Matching
between an expense's `(category, subCategory)` pair and a
`default_sub_category`/`user_sub_category` row happens exclusively via
`WHERE categoryName = ? AND subCategoryName = ?` string equality (see
`resolveAccountCode`, §3), case- and whitespace-sensitive except for a
`.trim()` on both sides.

**Every column across all entities that stores a category/subCategory NAME
as a string** (migration hazards — each is an independent point of truth
that a rename/restructure must update in lock-step, with no DB-enforced
consistency):

| Table | Column(s) |
|---|---|
| `default_sub_category` | `categoryName` |
| `user_category` | (is itself the category name row) `categoryName` |
| `user_sub_category` | `categoryName`, `subCategoryName` |
| `expense` | `category`, `subCategory` |
| `supplier` | `category`, `subCategory` |
| `journal_entry` | `subCategory` |
| `journal_line` | `subCategoryName` |
| `extracted_document` | `category`, `sub_category` |
| `classified_transactions` | `category`, `subCategory` |
| `transactions` (legacy) | `category`, `subCategory` |
| `slim_transactions` | `category`, `subCategory` |
| `full_transactions_cache` | `category`, `subCategory` |

Additionally, `default_sub_category.pnlCategory`, `user_sub_category.pnlCategory`,
`expense.pnlCategory`, and `default_booking_account.pnlCategory` are a
**second, parallel string-keyed namespace** (P&L presentation labels, e.g.
`'הוצאות משרד'`) that is matched against by more string equality
(`AccountSeedService.PNL_CATEGORY_TO_ACCOUNT`) — not the same strings as
`categoryName`/`subCategoryName`, and not FK-linked to them either.

---

## 3. `resolveAccountCode()` and the classification chain

**File:** `backend/src/expenses/expenses.service.ts:877-920`

```ts
/**
 * Resolve the bookkeeping account code for a (category, subCategory) pair.
 * The single source of truth for routing an expense to a כרטיס — used by
 * EVERY expense-creation path (manual entry, OCR document, bank-transaction
 * approval) so they all post to the same account.
 *
 * Resolution order (first non-empty wins):
 *   1. user_sub_category.accountCode    (per-business sub-category override)
 *   2. default_sub_category.accountCode (global sub-category mapping)
 *   3. user_category.accountCode        (per-business category override)
 *   4. default_category.accountCode     (global category default)
 *   5. '5000'                           (generic expense fallback)
 */
async resolveAccountCode(
    categoryName: string,
    subCategoryName: string,
    firebaseId?: string | null,
    businessNumber?: string | null,
): Promise<string> {
    const category = categoryName?.trim();
    const subCategory = subCategoryName?.trim();

    // 1. user sub-category override
    if (firebaseId && businessNumber && subCategory && category) {
        const userSub = await this.userSubCategoryRepo.findOne({
            where: { firebaseId, businessNumber, subCategoryName: subCategory, categoryName: category },
        });
        if (userSub?.accountCode) return userSub.accountCode;
    }

    // 2. default sub-category
    if (subCategory && category) {
        const defaultSub = await this.defaultSubCategoryRepo.findOne({
            where: { subCategoryName: subCategory, categoryName: category },
        });
        if (defaultSub?.accountCode) return defaultSub.accountCode;
    }

    // 3. user category override
    if (firebaseId && businessNumber && category) {
        const userCat = await this.userCategoryRepo.findOne({
            where: { firebaseId, businessNumber, categoryName: category },
        });
        if (userCat?.accountCode) return userCat.accountCode;
    }

    // 4. default category
    if (category) {
        const defaultCat = await this.defaultCategoryRepo.findOne({
            where: { categoryName: category },
        });
        if (defaultCat?.accountCode) return defaultCat.accountCode;
    }

    // 5. final fallback
    return '5000';
}
```

**Sub-ledger helper**, `resolveSubAccountCode` (`expenses.service.ts:928-937`)
— resolves `JournalEntry.subCounterAccountCode` / a line's sub-ledger code.
Global catalog only, no per-business override level exists for it:

```ts
private async resolveSubAccountCode(categoryName: string, subCategoryName: string): Promise<string | null> {
    const category = categoryName?.trim();
    const subCategory = subCategoryName?.trim();
    if (!category || !subCategory) return null;

    const defaultSub = await this.defaultSubCategoryRepo.findOne({
        where: { subCategoryName: subCategory, categoryName: category },
    });
    return defaultSub?.subAccountCode ?? null;
}
```

**Callers**, both inside `expenses.service.ts`:
- `buildExpenseJournalLines(expense)` (line 948) calls
  `resolveAccountCode(expense.category, expense.subCategory, expense.userId, expense.businessNumber)`
  → the line-level `accountCode` for the expense's debit line.
- `buildJournalEntryInput`-equivalent code around line 1017 calls
  `resolveSubAccountCode(expense.category, expense.subCategory)` →
  `subCounterAccountCode` on the `JournalEntry` header, alongside a fixed
  `counterAccountCode: '1100'`.

**5-level priority chain, exactly as documented in the source**:
1. `user_sub_category.accountCode` (per-business sub-category override)
2. `default_sub_category.accountCode` (global sub-category mapping)
3. `user_category.accountCode` (per-business category override)
4. `default_category.accountCode` (global category default)
5. hardcoded fallback `'5000'` ("הוצאות בלתי מזוהות" — unidentified expenses)

`subAccountCode`/`subCounterAccountCode` sit **outside** this priority
chain entirely — they come only from the global `default_sub_category` row
(step 2's table), never from a user override, and a miss simply leaves the
journal entry's `subCounterAccountCode` as `null` (no fallback account).

Every `accountCode` used anywhere (including the '5000' fallback) is
re-validated at journal-write time in `BookkeepingService.persistJournalEntry`
(`bookkeeping.service.ts:91-95`) via
`bookingAccountRepo.findOneByOrFail({ code: line.accountCode })` — a missing
code throws and rolls back the whole transaction (expense + journal entry
together), so an unmapped account code can never silently corrupt the
ledger, but it *can* hard-fail an otherwise-valid expense save if `'5000'`
itself were ever removed from `default_booking_account`.

**The seed logic that populates `accountCode`/`subAccountCode`** is a large,
multi-step, idempotent boot-time cascade in `AccountSeedService`
(`backend/src/bookkeeping/account-seed.service.ts`, ~640 lines) — not
described further here since it's config data, not classification logic,
but it is the mechanism that guarantees §3's 5-level chain almost never
bottoms out at `'5000'` for recognized business expenses. See §6.

---

## 4. User-created categories

**Yes** — users create their own categories/subcategories today, via a
fully separate table pair (`user_category`/`user_sub_category`, §1.3–1.4),
not by mutating `default_category`/`default_sub_category`.

- **Table/columns distinguishing user rows**: `user_category`/`user_sub_category`
  rows carry `firebaseId` + `businessNumber` (both required, not nullable) —
  every user row is scoped to exactly one business owned by one Firebase
  user. There is no shared `isDefault` boolean on a single unified table;
  "default vs. user" is which of the two physically separate tables the row
  lives in.
- **Create flow**: `POST expenses/add-user-category` →
  `ExpensesService.addUserCategory` (`expenses.service.ts:500`) — validates
  the user exists, checks for a name collision via `getUserCategory`, saves
  the `UserCategory` row, then calls `saveUserSubCategories` for any nested
  sub-categories passed in the same request. `POST
  expenses/add-user-sub-categories` → `addUserSubCategories`
  (`expenses.service.ts:534`) adds sub-categories under an existing category
  name (default or user) — no requirement that the parent category itself
  have a `user_category` row.
- **Edit flow**: `PATCH expenses/user-category/:id` /
  `PATCH expenses/user-sub-category/:id` → `updateUserCategory`
  (`expenses.service.ts:1485`) / `updateUserSubCategory` (`:1505`).
- **Delete flow**: `DELETE expenses/user-category/:id` /
  `.../user-sub-category/:id` → `deleteUserCategoryCascade`
  (`expenses.service.ts:1582`) / `deleteUserSubCategory` (`:1622`) — both
  **block the delete** if any `classified_transactions` row still
  references the category/subCategory name (`ConflictException` listing the
  affected rule ids), otherwise cascade-delete the category's own
  sub-categories in a transaction. This is itself evidence of the
  string-matching hazard from §2: the delete-safety check is a manual
  string-equality scan of another table, not a DB-enforced constraint.
- **Read/merge**: `getCategories`/`getSubCategories`
  (`expenses.service.ts:612`, `:688`) merge default + user rows into one
  list keyed by name, **user rows override default rows of the same
  name** (`Map.set` called with defaults first, user second).
- Admin-only global editing of `default_sub_category` itself also exists:
  `GET get-all-default-sub-categories`, `PATCH update-default-sub-category/:id`,
  `POST add-default-sub-category`, `DELETE delete-default-sub-category/:id`
  (all gated by `UsersService.isAdmin`, not the delegation/accountant model
  — a platform-admin concept, distinct from an accountant).
- A **subcategory-wide report-config override** also exists:
  `POST expenses/sub-category-report-config` →
  `setSubCategoryReportConfig` (`expenses.service.ts:1531`) — upserts a
  `UserSubCategory` row's `reportScope`/`pnlCategory` for a
  (categoryName, subCategoryName) pair, applied to **all** of that
  subcategory's expenses (resolved live, not backfilled).
- A legacy **bulk-load** admin path also exists outside the `expenses`
  module: `POST transactions/load-default-categories`
  (`transactions.controller.ts:555`, `TransactionsService.loadDefaultCategories`,
  `transactions.service.ts:450`) — accepts an uploaded Excel file with
  columns `categoryName`/`subCategoryName`/`taxPercent`/`vatPercent`/
  `reductionPercent`/`isEquipment`/`isRecognized`/`isExpense`, and
  upserts into `default_category`/`default_sub_category` by name. Marked
  `//TODO: Add Admin guard` — currently has **no guard at all**.

---

## 5. All consumers of category data

### 5.1 Journal entry creation
- `ExpensesService.buildExpenseJournalLines` / the surrounding
  `createExpenseJournalEntry` (`expenses.service.ts:1047`) /
  `syncExpenseJournalEntry` (`:1098`) — every expense (manual, OCR-confirmed,
  bank-transaction-confirmed) posts through `resolveAccountCode` (§3) via
  this path, exactly once at creation and again on re-classification (line
  replace, not header replace).
- `documents.service.ts` — `buildDocumentJournalLines` (module-level pure
  function, `documents.service.ts:48-112`) builds journal lines for
  **issued** documents (invoices/receipts/credit notes). It does **not**
  touch category/subCategory at all — issued-document lines always post to
  fixed accounts (`4000` income, `4010` exempt income, `2400` output VAT,
  `1100`/`1200` cash/A-R) selected purely by `DocumentType`, never by a
  category lookup.
- `BookkeepingService.createManualJournalEntry`
  (`bookkeeping.service.ts:183-324`) — the manual-entry UI path. For expense
  entries the client supplies `accountCode` directly (validated against
  `default_booking_account`, must be `type === 'expense'` and have a
  non-null `pnlCategory`) and an optional free-text `subCategoryName` — no
  `resolveAccountCode` call; the user (or their accountant) picks the
  account directly from a dropdown of postable accounts.
- `BookkeepingService.persistJournalEntry` (`:63-153`) — the single write
  path all of the above funnel through; re-validates every line's
  `accountCode` against `default_booking_account` before any write (§3).

### 5.2 VAT report
- `ReportsService.createVatReportFromJournal`
  (`reports.service.ts:454-506`) — **account-code only**, no
  category/subCategory/pnlCategory read at all. Hardcoded `jl.accountCode`
  checks against `'4000'`/`'4010'`/`'2400'`/`'2410'` plus the `isEquipment`
  boolean to split input-VAT into expense vs. asset refund.
- There is **no separate "legacy" VAT report function anymore** — a prior
  `VatReportService` was removed in commit `b4ccc364` ("refactor: remove
  VatReportService and its tests..."). Only the `...FromJournal` naming
  survives from when both a legacy and a journal-based version coexisted.
- The VAT **PDF export**'s per-expense detail table
  (`ReportsService.generateVatReportPdfForExport`, `:195`) does **not** use
  the journal — it calls `ExpensesService.getExpensesForVatReport`
  (`expenses.service.ts:1341`) and reads `Expense.category`/`subCategory`
  directly:
  ```ts
  category: e.category ?? '',
  subCategory: e.subCategory ?? '',
  ```
  So one PDF mixes two sources of truth: journal/account-code totals at the
  top, `Expense.category`/`subCategory` strings in the itemized table below.
  `getExpensesForVatReport` also computes `resolvedPnlCategory =
  e.pnlCategory ?? pnlCategoryMap.get(e.subCategory) ?? e.category`
  (`:1352-1354`) but this field is **not consumed** by the VAT PDF — dead
  for this report, used only by the bookkeeping-table UI.

### 5.3 P&L report
- `ReportsService.createPnLReportFromJournal`
  (`reports.service.ts:526-598`) buckets **only by
  `DefaultBookingAccount.pnlCategory`**, joined via `jl.accountCode`:
  ```ts
  .innerJoin(DefaultBookingAccount, 'dba', 'dba.code = jl.accountCode')
  ...
  .andWhere('dba.pnlCategory IS NOT NULL')
  .andWhere('jl.isEquipment = false');
  ...
  const category = String(r.pnlCategory);            // ← DefaultBookingAccount.pnlCategory
  expenseSumByCategory[category] += amountForTax;
  ```
  **Audit-worthy divergence**: two in-code comments claim a three-way
  precedence — `expense.pnlCategory` (`expenses.entity.ts:139-141`) →
  `subcategory.pnlCategory` → bookkeeping category, and near-identically in
  `report-review.service.ts:462-465` — but `createPnLReportFromJournal`
  implements **none of that**; it reads exclusively
  `DefaultBookingAccount.pnlCategory`. The documented three-way precedence
  (`expense.pnlCategory ?? pnlCategoryMap.get(subCategory) ?? category`) is
  real code, but it lives only in `ExpensesService.getExpensesForVatReport`/
  `getPnlCategoryMap` (§5.2) — used for UI display columns, not for P&L
  report totals. `expense.pnlCategory` is in fact always written `NULL` by
  the report-review approval paths (`report-review.service.ts:462/581/679`),
  on the stated (and here shown to be partly inaccurate) assumption that
  it's "resolved live by the P&L report."
- The `ExpensePnlDto.category` field name (`reports/dtos/pnl-report.dto.ts`)
  is a naming trap: it holds `DefaultBookingAccount.pnlCategory`, never an
  `Expense.category`/`subCategory` value.
- `osekZair` ("small trader") mode bypasses all category grouping, emitting
  one synthetic line `{ category: 'ניכוי 30% הוצאות לעוסק זעיר', total }`.
- `pnl-report-pdf.ts:106` renders `expense.category` (i.e. the resolved
  `pnlCategory` bucket label) as a plain row label — no further logic.

### 5.4 Ledger report (כרטסת)
- `ReportsService.createLedgerReport` (`reports.service.ts:611-`) groups
  strictly by `jl.accountCode` (optional exact-match filter param), ordered
  `accountCode, date, id, lineInEntry`. `je.subCategory` /
  `jl.subCategoryName` are read **only for display** (the "פירוט" line
  description via `buildLineDescription`), never for grouping/filtering.
  Debit/credit-normal balance direction comes from
  `DefaultBookingAccount.type`, not category.
- `getJournalEntryDetail` (`:837`) — single-entry drill-down, same
  accountCode-for-grouping / subCategoryName-for-display pattern.
- `getLedgerAccounts` (`:895`) returns the full chart of accounts (including
  technical accounts); `getLedgerEntryAccounts` (`:906`, the manual-entry
  dropdown) filters to `pnlCategory IS NOT NULL` only.

### 5.5 Depreciation report (Form 1342) / Advance-tax report
- `createForm1342Report` (`reports.service.ts:1122`) reads only
  `Expense.isEquipment` (plus `reductionPercent`, `sum`) — no
  category/subCategory/pnlCategory/accountCode at all.
- `getAdvanceIncomeTaxReportData*` (`:254-417`) reads `Documents`
  (issued-document sums by `docType`) — entirely bypasses the
  category/account-code system. Out of scope for a category redesign.
- SHAAM Uniform File export, `generateB100Section`
  (`reports.service.ts:1586`) — writes `JournalLine.accountCode` verbatim
  into the fixed-width B100 record; no category/pnlCategory involvement.

### 5.6 OCR / document classification pipeline
- `DocumentsService.processInboxForUser` / `uploadAndOcrDoc`
  (`documents.service.ts`, batch and single-file OCR ingestion) persist
  `category`/`subCategory` straight from Claude's OCR JSON output onto
  `ExtractedDocument` (`category: inv.category ?? null, subCategory:
  inv.sub_category ?? null`) — **no call to `resolveAccountCode` or any
  account-code resolver** at this stage (grep-confirmed zero matches in
  `documents.service.ts`/`documents.controller.ts`).
- `DocumentsService.buildExtractionCatalog` (`:3279`) builds the merged
  `DefaultSubCategory` + `UserSubCategory` catalog (user overrides win) that
  is (a) sent to Claude as the allowed-category list for OCR, and (b) served
  to the frontend review dropdown.
- Account-code resolution happens **downstream**, off the confirmed
  `Expense`, not off `ExtractedDocument`: a reviewed row is approved into an
  `Expense` by `ReportReviewService` (`approveMatched`/`approveDocCash`/
  `approveTxNoDoc`, `report-review.service.ts:390/529/630` — same
  override-precedence pattern repeated three times: `overrides.category ??
  doc.category ?? slim.category`), and only then does
  `ExpensesService.addExpense` → `buildExpenseJournalLines` →
  `resolveAccountCode` run (§3, §5.1).
- Bank/card auto-classification: `ClassifiedTransactions` rules
  (`transaction-processing.service.ts`) — `classifyManually` (one-off,
  writes straight onto `SlimTransaction`/`FullTransactionCache`) vs.
  `classifyWithRule` (creates/updates a `ClassifiedTransactions` row keyed
  by `(userId, billId, transactionName, ...)`, applied automatically to
  future matching transactions via `matchRule`, tie-broken by
  most-specific-conditions then newest `updatedAt`).

### 5.7 Angular components/services
| Component/Service | File | Category involvement | Endpoint(s) |
|---|---|---|---|
| `ExpenseDataService` | `services/expense-data.service.ts` | Core category CRUD client, used by modal-add-expenses, add-supplier, category-management, book-keeping | `get-categories`, `get-sub-categories`, `get-all-default-sub-categories`, `update/add/delete-default-sub-category`, `sub-category-report-config`, `user-categories`, `user-category/:id`, `user-sub-category/:id` |
| `TransactionsService` | `pages/transactions/transactions.page.service.ts` | Backs `AddCategoryComponent`'s create flow | `add-user-category`, `add-user-sub-categories`, `get-categories` |
| `AddSupplierService` | `components/add-supplier/add-supplier.service.ts` | reactive sub-category fetch via `httpResource` | `get-sub-categories` |
| `CategoryManagementComponent` | `shared/category-management/` | Admin-only CRUD of the global `default_sub_category` catalog + Excel export (resolves `accountCode` → name via `LedgerReportService.getLedgerAccounts`) | full default-sub-category CRUD set |
| `ModalExpensesComponent` | `shared/modal-add-expenses/` | Core add/edit-expense modal; cascading category → sub-category dropdowns, autofills tax/VAT/reduction from the selected sub-category; no category-creation UI here | `get-categories`, `get-sub-categories` |
| `AddCategoryComponent` | `components/add-category/add-category.component.ts` | The actual category/sub-category **creation** UI; `subCategoryMode` toggles "new category" vs. "new sub-category under existing" | `add-user-category`, `add-user-sub-categories` |
| `addSupplierComponent` (shared, legacy) / newer `components/add-supplier` | `shared/add-supplier/`, `components/add-supplier/` | cascading category pickers, autofill tax/VAT/depreciation | `get-categories`, `get-sub-categories` |
| `expenses.page.ts` | `pages/book-keeping/expenses/` | Table columns `CATEGORY`, `SUB_CATEGORY`, `PNL_CATEGORY` (the latter from `resolvedPnlCategory`) | — |
| `ledger-report.page.ts` | `pages/ledger-report/` | Displays **account** (כרטיס), not category — `accountCode` filter + header `` `כרטיס: ${accountName} - ${accountCode}` ``; also a `subCategoryName` filter | `reports/ledger-report`, `reports/ledger-accounts` |
| `pnl-report-journal.page.ts` | `pages/pnl-report-journal/` | No per-row category columns; one hardcoded synthetic label for osek-zair mode | — |
| `vat-report-journal.page.ts` | `pages/vat-report-journal/` | `CATEGORY`/`SUB_CATEGORY` DDL columns in the expense list | — |

---

## 6. Seed file

**There is no static seed *data file* (no CSV/JSON/SQL fixture) for
`default_category`/`default_sub_category` that ships with the repo and gets
imported once.** Instead, seeding is **code**, run automatically on every
backend boot:

- **`backend/src/bookkeeping/account.seed.ts`** — `DEFAULT_ACCOUNTS`, a
  22-row static TypeScript array (the chart of accounts, `1000`–`6300`).
- **`backend/src/bookkeeping/account-seed.service.ts`** —
  `AccountSeedService implements OnModuleInit` (~640 lines), which on every
  process start:
  1. Upserts `DEFAULT_ACCOUNTS` into `default_booking_account`
     (`INSERT ... ON DUPLICATE KEY UPDATE`, keyed on `code` — always
     overwrites `name`/`type`/`pnlCategory`/`displayOrder` for these codes).
  2. `seedExpenseSubCategoryMappings` — ensures ~35 canonical
     `(category, subCategory) → pnlCategory` pairs exist in
     `default_sub_category` (`EXPENSE_SUBCATEGORY_PNL` constant),
     **INSERT-only** — never touches a row that already exists (admin-panel
     edits own the row from that point).
  3. `seedSubCategoryAccountCodes` — a 7-step idempotent UPDATE cascade
     (recognized-expense baseline → legacy pnlCategory map → legacy
     "ספקים" override → category-level defaults → sub-category name
     keyword matching → equipment → income) that fills `accountCode` on
     any `default_sub_category` row where it is currently `NULL`, plus a
     parallel one-shot legacy-pnlCategory pass for `user_sub_category`.
  4. `seedCategoryAccountCodes` — fills `default_category.accountCode` from
     a static `CATEGORY_ACCOUNT_DEFAULTS` map, NULL-only guard.
  5. `seedSubAccountCodes` — fills `default_sub_category.subAccountCode`
     from a static `SUBCATEGORY_SUB_ACCOUNT_CODES` map (~30 pairs), NULL-only
     guard.
  6. `logSubCategoryAccountCodeValidation` — read-only post-seed sanity
     logging (unknown account codes in use, rows still NULL, rows still on
     the `'5000'` fallback).
- **Row count**: not fixed — grows only via the `EXPENSE_SUBCATEGORY_PNL`
  constant (~35 pairs as of this audit) plus whatever an admin has added
  via the admin panel or the bulk-upload path below; every seed step is
  guarded to never overwrite an existing row.
- **How it runs**: automatically, in-process, on every backend boot
  (`OnModuleInit`), *and* separately, manually, via the legacy
  **`POST transactions/load-default-categories`** endpoint (Excel upload,
  `TransactionsService.loadDefaultCategories`, `transactions.service.ts:450`)
  — parses an uploaded workbook with columns `categoryName`/
  `subCategoryName`/`taxPercent`/`vatPercent`/`reductionPercent`/
  `isEquipment`/`isRecognized`/`isExpense` and upserts by name. This
  endpoint currently has **no auth guard at all** (a `//TODO: Add Admin
  guard` comment is the only gate).
- **Propagation to an existing production DB**: purely by redeploying the
  backend — the boot-time seed is idempotent (fills NULLs, never
  overwrites), so a schema/data change to the seed logic self-applies on
  the next deploy with no separate migration step. There is no rollback
  mechanism; a bad edit to `account.seed.ts`/`account-seed.service.ts`
  self-propagates identically. `synchronize: process.env.NODE_ENV !==
  'production'` (`app.module.ts:108`) means **schema** changes (new
  columns, etc.) still auto-apply outside production via TypeORM
  synchronize, but not in production — production schema changes need the
  separate `backend/scripts/migrations/*.sql` files run manually.

---

## 7. Accountant / multi-tenant model

A partial model exists — enough for an accountant to manage multiple
clients today, but with meaningful gaps for the redesign to close.

### 7.1 `Delegation` — the only entity in `backend/src/delegation/`

```ts
export enum DelegationStatus { ACTIVE = 'ACTIVE', REVOKED = 'REVOKED' }

@Entity()
@Index('ux_delegation_agent_external', ['agentId', 'externalCustomerId'], { unique: true })
export class Delegation {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar' }) userId: string;              // client's Firebase UID
  @Column({ type: 'varchar' }) agentId: string;              // accountant's Firebase UID
  @Column({ type: 'varchar', nullable: true }) externalCustomerId: string | null;
  @Column({ type: 'enum', enum: DelegationStatus, default: DelegationStatus.ACTIVE }) status: DelegationStatus;
  @Column({ type: 'simple-array', nullable: true }) scopes: string[];  // e.g. DOCUMENTS_READ, DOCUMENTS_WRITE
}
```
A flat join table between one client (`userId`) and one accountant
(`agentId`). No `@ManyToOne` relations to `User`/`Business` — all joins are
manual string matching in the service layer. The unique index is on
`(agentId, externalCustomerId)`, **not** `(agentId, userId)`, so nothing at
the DB level prevents duplicate active delegations for the same pair.

### 7.2 Business/User ownership — no multi-owner support today
- `Business` (`backend/src/business/business.entity.ts`) has a plain
  `firebaseId: string` column, **no** `accountantId`/`ownerId` field, and
  **no unique constraint on `businessNumber`**. A `Business` belongs to
  exactly one `firebaseId` (one-to-many from user → businesses, not
  many-to-many) — `getUserBusinesses(firebaseId)` is a flat `find({ where:
  { firebaseId } })`.
- `User` (`backend/src/users/user.entity.ts`) **does** have a role concept:
  `role: UserRole[]` (`simple-array`), `UserRole` = `REGULAR | ADMIN |
  ACCOUNTANT` (`backend/src/enum.ts`). No `CLIENT` role, and it's a flat
  array on `User`, not scoped per-business/per-relationship.
- A **second**, unrelated "role" flag exists purely at the request level:
  `FirebaseAuthGuard` sets `request.user.role` to the literal string
  `'user'` or `'agent'` when impersonating a client via an
  `x-client-user-id` header — distinct from the DB `UserRole` enum, used
  by `business.controller.ts` to block accountants from
  create/update/delete on a client's business (read-only for accountants at
  the business level).

### 7.3 Permission enforcement — mostly in the guard, not the delegation module
`delegation.controller.ts` routes (`@Controller('delegations')`):
`POST invite`, `GET approve-delegation`, `GET users-for-agent/:agentId`
(**no auth guard at all**), `GET my-permissions`, `POST grant-view`,
`POST create-client` (+ `isAccountant()` check), `DELETE client/:clientId`
(+ `isAccountant()` check).

The actual cross-user impersonation check lives in
`guards/firebase-auth.guard.ts`: when a request carries
`x-client-user-id`, an `ADMIN`-role user bypasses delegation entirely, and
otherwise the guard does an existence-only lookup —
`delegationRepository.findOne({ where: { userId: clientUserId, agentId:
authenticatedFirebaseId } })` — **ignoring `status`** (a `REVOKED` row still
passes the query, since `status` isn't filtered) **and ignoring `scopes`
entirely**. Once matched, the request is fully re-scoped to the client's
`firebaseId` for every downstream controller, including expense/category
writes — `scopes` (`DOCUMENTS_READ`/`DOCUMENTS_WRITE`) is written by
`delegation.service.ts` but never read anywhere outside that same file.

### 7.4 Accountant-created client accounts — exists, single-business only
`POST delegations/create-client` → `DelegationService.createClientByAccountant`
(`delegation.service.ts:387-498`) — creates a Firebase Auth user
(`password = "KE" + phone`), a `User` row (`role: [REGULAR]` — never
`ACCOUNTANT`), exactly **one** `Business` row, a trial subscription, and one
`Delegation` row with `scopes: ['DOCUMENTS_READ', 'DOCUMENTS_WRITE']`. No
support for attaching multiple businesses to one client in a single call,
and no notion of a client having multiple accountants beyond creating
multiple `Delegation` rows manually (mechanically possible, not
surfaced/tested anywhere found).

### 7.5 Explicit gaps relative to the planned redesign
- No `SYSTEM`/`ACCOUNTANT`/`CLIENT` owner concept anywhere — no
  `ownerType`/`ownerId` field on any category-related entity.
- No `accountantId`/`ownerId` column on `Business`; no M:N `User`↔`Business`
  join table.
- `businessNumber` has no DB uniqueness constraint.
- `Delegation.scopes` is persisted but unenforced outside its own module.
- `GET delegations/users-for-agent/:agentId` has no auth guard.
- Delegation lookup in the auth guard doesn't filter by `status`
  (`REVOKED` is defined but never actually assigned anywhere in the
  codebase today — `deleteClientByAccountant` hard-deletes the row instead).

---

## 8. Production data snapshot — SQL to run in phpMyAdmin

**Not executed** — for the user to run manually against production.

```sql
-- Row counts
SELECT
  (SELECT COUNT(*) FROM default_category)     AS default_category_count,
  (SELECT COUNT(*) FROM default_sub_category) AS default_sub_category_count,
  (SELECT COUNT(*) FROM user_category)        AS user_category_count,
  (SELECT COUNT(*) FROM user_sub_category)    AS user_sub_category_count,
  (SELECT COUNT(*) FROM expense)              AS expense_count,
  (SELECT COUNT(*) FROM journal_entry)        AS journal_entry_count,
  (SELECT COUNT(*) FROM journal_line)         AS journal_line_count;

-- Distinct (category, subCategory) pairs actually used in expenses
SELECT category, subCategory, COUNT(*) AS n
FROM expense
GROUP BY category, subCategory
ORDER BY n DESC;

-- Orphaned classifications: expense (category, subCategory) pairs with
-- NO matching row in default_sub_category (global catalog)
SELECT DISTINCT e.category, e.subCategory
FROM expense e
LEFT JOIN default_sub_category d
  ON d.categoryName = e.category AND d.subCategoryName = e.subCategory
WHERE d.id IS NULL;

-- Same, but also excluding pairs that DO match a user_sub_category row
-- for that expense's own userId+businessNumber (i.e. truly unmatched
-- anywhere, not just missing from the global catalog)
SELECT DISTINCT e.category, e.subCategory
FROM expense e
LEFT JOIN default_sub_category d
  ON d.categoryName = e.category AND d.subCategoryName = e.subCategory
LEFT JOIN user_sub_category u
  ON u.categoryName = e.category AND u.subCategoryName = e.subCategory
  AND u.firebaseId = e.userId AND u.businessNumber = e.businessNumber
WHERE d.id IS NULL AND u.id IS NULL;

-- Count of orphaned expense rows (not just distinct pairs)
SELECT COUNT(*) AS orphaned_expense_rows
FROM expense e
LEFT JOIN default_sub_category d
  ON d.categoryName = e.category AND d.subCategoryName = e.subCategory
LEFT JOIN user_sub_category u
  ON u.categoryName = e.category AND u.subCategoryName = e.subCategory
  AND u.firebaseId = e.userId AND u.businessNumber = e.businessNumber
WHERE d.id IS NULL AND u.id IS NULL;

-- Distribution of subAccountCode values actually posted to journal_entry
SELECT subCounterAccountCode, COUNT(*) AS n
FROM journal_entry
GROUP BY subCounterAccountCode
ORDER BY n DESC;

-- Distribution of accountCode values actually used on expense-derived
-- journal lines (join back to journal_entry to scope to EXPENSE reference type)
SELECT jl.accountCode, COUNT(*) AS n
FROM journal_line jl
JOIN journal_entry je ON je.id = jl.journalEntryId
WHERE je.referenceType = 'EXPENSE'
GROUP BY jl.accountCode
ORDER BY n DESC;

-- How many default_sub_category rows still sit on the generic '5000'
-- fallback despite being a recognized, deductible expense
SELECT categoryName, subCategoryName
FROM default_sub_category
WHERE accountCode = '5000' AND isRecognized = 1 AND isExpense = 1;

-- How many default_sub_category rows have NO accountCode at all
SELECT COUNT(*) AS null_account_code_subcategories
FROM default_sub_category
WHERE accountCode IS NULL;

-- User-specific vs default-catalog classification split:
-- an expense "uses a user category" when its (category, subCategory) pair
-- matches a user_sub_category row for that same user+business (there is no
-- direct FK/flag on `expense` itself recording this — inferred by join).
SELECT
  SUM(CASE WHEN u.id IS NOT NULL THEN 1 ELSE 0 END) AS expenses_on_user_subcategory,
  SUM(CASE WHEN u.id IS NULL THEN 1 ELSE 0 END)      AS expenses_on_default_or_unmatched
FROM expense e
LEFT JOIN user_sub_category u
  ON u.categoryName = e.category AND u.subCategoryName = e.subCategory
  AND u.firebaseId = e.userId AND u.businessNumber = e.businessNumber;
```

---

## 9. Risks & couplings summary

Ordered by risk to a category-system redesign, highest first:

1. **Zero FK enforcement, everywhere.** Every category reference in the
   system (`expense`, `supplier`, `extracted_document`,
   `classified_transactions`, `transactions`, `slim_transactions`,
   `full_transactions_cache`, `journal_entry.subCategory`,
   `journal_line.subCategoryName`) is a bare string copied at write time.
   A rename/restructure of category or subcategory names must be
   propagated by hand across ~12 tables with no database-level safety net;
   §8's orphan-detection queries will be the only way to measure blast
   radius before migrating.

2. **`resolveAccountCode`'s 5-level chain is the single hidden source of
   truth for money routing**, but it is pure runtime logic (§3), not data —
   any redesign that flattens category/sub-category into one table must
   reproduce this exact precedence (`user sub → default sub → user cat →
   default cat → '5000'`) or every existing expense's account will silently
   shift on the next edit/re-sync.

3. **The P&L report does not implement the precedence its own code
   comments document.** `createPnLReportFromJournal` buckets solely by
   `DefaultBookingAccount.pnlCategory` (via posted `accountCode`); the
   `expense.pnlCategory → subcategory.pnlCategory → category` cascade
   described in `expenses.entity.ts` and `report-review.service.ts` is real
   code but drives only a UI display column
   (`resolvedPnlCategory`/`getPnlCategoryMap`), never the P&L totals. A
   redesign that unifies "category" and "P&L presentation" must decide
   which of these two behaviors is the actual spec — they currently
   disagree.

4. **`AccountSeedService`'s boot-time cascade (~640 lines, 7-step UPDATE
   precedence) is config-as-code with NULL-only write guards.** It is the
   *only* mechanism that populates `accountCode`/`subAccountCode`/
   `pnlCategory` on the global catalog, and it explicitly never touches a
   row once set (to protect admin edits). A two-table redesign must either
   keep an equivalent boot-time seeder or perform a one-time backfill that
   reproduces its 7-step precedence exactly, since removing/renaming
   `account.seed.ts`'s codes would break the "never overwrite" guard's
   assumptions on existing rows.

5. **Two independent classification-rule tables shadow the category
   catalog with denormalized snapshots**: `ClassifiedTransactions` (bank
   auto-classify rules) and `Supplier` (prefill defaults) each carry their
   own full copy of category/subCategory/tax%/vat%/reduction%/isEquipment,
   captured at rule/supplier-creation time and never re-synced if the
   catalog changes later. `deleteUserCategoryCascade`/`deleteUserSubCategory`
   already have to manually guard against orphaning `ClassifiedTransactions`
   rows (§4) — a redesign changing category identity (e.g. moving from
   name-keyed to id-keyed) must re-point or migrate these snapshots too.

6. **`synchronize: process.env.NODE_ENV !== 'production'`** (`app.module.ts:108`)
   means schema changes auto-apply in dev/shared-dev but not in production
   — see existing memory note on dev-DB synchronize thrash; a redesign's
   schema migration must be hand-written for production regardless of what
   works automatically in dev, and dev-DB column drops during active
   redesign work are a known live risk.

7. **The `Delegation`/accountant model has no multi-owner concept and weak
   scope enforcement** (§7.3–7.5): any accountant with an (even revoked,
   even read-only-scoped) `Delegation` row can fully read/write a client's
   categories today, because `scopes` is unenforced downstream. A
   SYSTEM/ACCOUNTANT/CLIENT owner redesign needs a real authorization layer
   here, not just new columns — the current guard-level impersonation
   swap treats every delegated session identically to the client's own.

8. **The OCR pipeline and the bookkeeping resolver are decoupled by
   design** (§5.6): `ExtractedDocument.category`/`subCategory` are raw OCR
   output, validated only informally (against the catalog sent to Claude as
   a hint, not enforced), and `resolveAccountCode` only runs after a human
   approves the row into an `Expense`. A redesign must preserve this
   two-phase gap (OCR guess → human-confirmed classification →
   account resolution) rather than assuming account codes are known at OCR
   time.

9. **No DB uniqueness on `(categoryName, subCategoryName)`** in
   `default_sub_category`/`user_sub_category` — `AccountSeedService`'s own
   existence checks (`SELECT ... LIMIT 1`) are the only thing preventing
   duplicate rows, and they run inside a boot-time loop with no
   transaction/lock around the check-then-insert, i.e. theoretically
   racy (low practical risk today since it only runs once at process
   start, but worth calling out for a redesign that adds concurrent
   writers).

10. **The legacy `POST transactions/load-default-categories` bulk-upload
    endpoint has no auth guard** (§4, §6) — an unauthenticated actor who
    discovers the route can upsert arbitrary rows into the **global**
    `default_category`/`default_sub_category` catalog (shared across every
    business). Independent of the redesign's scope, but any migration that
    touches this endpoint's shape should also close this gap.
