# Manual Journal Entry — Research Notes

Research pass for building a manual, single-sided (חד-צידית, ללא חשבון נגד) journal-entry
entry form. Read-only investigation — no code changed. See also `docs/bookkeeping-system.md`
for the full existing-behavior writeup this draws from.

---

## 1. Entities/Schema

**`JournalEntry`** — `backend/src/bookkeeping/jouranl-entry.entity.ts`

| Field | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int` (auto-inc PK) | no | — | Globally unique, NOT per-business |
| `entryNumber` | `int` | yes | — | Per-business running display number, from `SharedService.getJournalEntryCurrentIndex` |
| `issuerBusinessNumber` | `string` | no | — | |
| `firebaseId` | `string` | no | `''` | Owner scope, so two users sharing a businessNumber can't see each other's entries |
| `date` | `date` | no | — | |
| `description` | `string` | yes | — | |
| `referenceType` | `enum JournalReferenceType` | yes | — | |
| `referenceId` | `bigint` | no | — | ID of source expense/document |
| `valueDate` | `date` | yes | — | תאריך ערך |
| `vatDate` | `date` | yes | — | תאריך למע"מ |
| `notes` | `string` | yes | — | |
| `vatReportingPeriod` | `varchar` | yes | `null` | e.g. `"3/2026"`, `"1-2/2026"`, `"2026"` |
| `subCategory` | `string` | yes | `null` | Null for income-document entries |
| `counterAccountCode` | `string` | yes | `null` | The single counter-account (e.g. `1100`, `1200`, `2000`) |
| `subCounterAccountCode` | `string` | yes | `null` | Sub-ledger code from `default_sub_category.subAccountCode` |
| `counterPartyName` | `string` | yes | `null` | Vendor/customer name |
| `documentTotal` | `decimal(12,2)` | yes | `null` | Full doc total incl. VAT |
| `createdAt` | Date | no | now() | |

**`JournalLine`** — `backend/src/bookkeeping/jouranl-line.entity.ts`

| Field | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | PK | no | — | |
| `issuerBusinessNumber` | `string` | no | — | |
| `firebaseId` | `string` | no | `''` | Mirrors header |
| `journalEntryId` | `int` | no | — | FK to header |
| `lineInEntry` | `int` | no | — | 1-based line ordinal |
| `accountCode` | `string` | no | — | FK-by-value to `DefaultBookingAccount.code` |
| `debit` | `decimal(12,2)` | no | `0` | |
| `credit` | `decimal(12,2)` | no | `0` | |
| `amountBeforeVat` | `decimal(12,2)` | no | `0` | סכום לרוה"ס |
| `vatAmount` | `decimal(12,2)` | no | `0` | סכום למע"מ |
| `isEquipment` | `boolean` | yes | `false` | Excludes line from P&L, splits VAT-input reporting |
| `taxPercent` | `decimal(5,2)` | no | `100` | % מוכר למס הכנסה |
| `vatPercent` | `decimal(5,2)` | no | `100` | % מוכר למע"מ |
| `amountForTax` | `decimal(12,2)` | no | `0` | = debit × taxPercent/100; feeds the P&L report |
| `subCategoryName` | `string` | yes | `null` | Null on VAT (2410) / income lines |

**`DefaultBookingAccount`** (chart of accounts) — `backend/src/bookkeeping/account.entity.ts`:
`id`, `code` (unique), `name`, `type: 'asset'|'liability'|'equity'|'income'|'expense'`,
`pnlCategory` (nullable — `null` = technical account, invisible in P&L), `displayOrder`
(nullable, **currently unused by any report code**).

---

## 2. DTOs

There is **one shared DTO pair**, not per-document-type —
`backend/src/bookkeeping/dto/journal-entry-input.interface.ts`:

```ts
export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  amountBeforeVat?: number;
  vatAmount?: number;
  isEquipment?: boolean;
  taxPercent?: number;      // defaults to 100
  vatPercent?: number;      // defaults to 100
  amountForTax?: number;
  subCategoryName?: string | null;
}

export interface JournalEntryInput {
  firebaseId: string;
  issuerBusinessNumber: string;
  subCategory?: string | null;
  counterAccountCode?: string | null;
  subCounterAccountCode?: string | null;
  counterPartyName?: string | null;
  documentTotal?: number | null;
  date: string;
  valueDate?: string;
  vatDate?: string;
  notes?: string;
  vatReportingPeriod?: string | null;
  referenceType?: JournalReferenceType;
  referenceId?: number;
  description?: string;
  lines: JournalLineInput[];
}
```

Callers (`expenses.service.ts`, `documents.service.ts`) each build their own
`JournalEntryInput`/`JournalLineInput[]` in private helpers — there is no `MANUAL`-specific
DTO or class-validator DTO at all (these are plain TS interfaces, not NestJS `class`-based
DTOs with decorators).

---

## 3. Service Layer — journal creation

Core persistence is generic and "dumb" in `backend/src/bookkeeping/bookkeeping.service.ts` —
`createJournalEntry` → `persistJournalEntry` (lines 40–149). It:
- Resolves every line's `accountCode` against `DefaultBookingAccount` first
  (`findOneByOrFail`) — a bad code aborts before any write.
- Allocates `entryNumber` via `SharedService.getJournalEntryCurrentIndex`.
- Saves header then lines in one transaction; increments the counter only on success.
- All numeric fields fall back with `?? `/`|| 0` defaults matching the entity defaults.

```ts
async createJournalEntry(input: JournalEntryInput, manager?: EntityManager): Promise<{ entryNumber: number; id: number }> {
  try {
    if (manager) {
      return await this.persistJournalEntry(input, manager);
    } else {
      return await this.dataSource.transaction((m) => this.persistJournalEntry(input, m));
    }
  } catch (err) {
    console.error('❌ Failed to create journal entry:', {
      issuerBusinessNumber: input.issuerBusinessNumber,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      error: err?.message,
    });
    throw err;
  }
}

private async persistJournalEntry(input: JournalEntryInput, m: EntityManager): Promise<{ entryNumber: number; id: number }> {
  const {
    firebaseId, issuerBusinessNumber, subCategory, counterAccountCode, subCounterAccountCode,
    counterPartyName, documentTotal, date, valueDate, vatDate, notes, vatReportingPeriod,
    referenceType, referenceId, description, lines,
  } = input;

  const journalEntryRepo = m.getRepository(JournalEntry);
  const journalLineRepo = m.getRepository(JournalLine);
  const bookingAccountRepo = m.getRepository(DefaultBookingAccount);

  // 1. Resolve every account FIRST so a missing code aborts before any write.
  const resolvedLines = await Promise.all(
    lines.map(async (line, index) => {
      const account = await bookingAccountRepo.findOneByOrFail({ code: line.accountCode });
      return {
        firebaseId, issuerBusinessNumber, accountCode: account.code, lineInEntry: index + 1,
        debit: line.debit || 0, credit: line.credit || 0,
        amountBeforeVat: line.amountBeforeVat || 0, vatAmount: line.vatAmount || 0,
        isEquipment: line.isEquipment ?? false,
        taxPercent: line.taxPercent ?? 100, vatPercent: line.vatPercent ?? 100,
        amountForTax: line.amountForTax ?? 0, subCategoryName: line.subCategoryName ?? null,
      };
    }),
  );

  // 2. Per-business running number for display (NOT the PK).
  const entryNumber = await this.sharedService.getJournalEntryCurrentIndex(issuerBusinessNumber, m);

  // 3. Save header — NO explicit id; MySQL auto-increment assigns the PK.
  const journalEntry = await journalEntryRepo.save(
    journalEntryRepo.create({
      entryNumber, firebaseId, issuerBusinessNumber,
      subCategory: subCategory ?? null,
      counterAccountCode: counterAccountCode ?? null,
      subCounterAccountCode: subCounterAccountCode ?? null,
      counterPartyName: counterPartyName ?? null,
      documentTotal: documentTotal ?? null,
      date, valueDate: valueDate ?? null, vatDate: vatDate ?? null,
      notes: notes ?? null, vatReportingPeriod: vatReportingPeriod ?? null,
      referenceType, referenceId, description: description || '',
    }),
  );

  // 4. Save lines, linked to the auto-generated PK.
  await journalLineRepo.save(resolvedLines.map((l) => journalLineRepo.create({ ...l, journalEntryId: journalEntry.id })));

  // 5. Advance the per-business running number — only after a successful post.
  await this.sharedService.incrementJournalEntryIndex(issuerBusinessNumber, m);

  return { entryNumber, id: journalEntry.id };
}
```

`BookkeepingService` also exposes `replaceJournalEntryLines` (swap lines only, keep header)
and `updateJournalEntryFull` (update header + lines by `entryNumber`) — both used for
re-syncing an entry after its source row is edited/re-classified, not relevant to manual
creation.

The **business logic** (which accounts, when to split VAT) lives entirely in the callers,
not in `BookkeepingService`:

### Expense path

`buildExpenseJournalLines` (private, `backend/src/expenses/expenses.service.ts:948`):

```ts
private async buildExpenseJournalLines(expense: Expense): Promise<JournalLineInput[]> {
  const total = Number(expense.sum) || 0;
  const vatInput = Number(expense.totalVatPayable) || 0;
  const hasVat = vatInput > 0;
  const net = Number((total - vatInput).toFixed(2));

  const expenseAccountCode = await this.resolveAccountCode(
    expense.category, expense.subCategory, expense.userId, expense.businessNumber,
  );

  const isEquipment = expense.isEquipment ?? false;
  const taxPct = Number(expense.taxPercent) || 0;
  const vatPct  = Number(expense.vatPercent)  || 0;
  const amountForTax = Number(expense.totalTaxPayable) || 0;

  return hasVat
    ? [
        { accountCode: expenseAccountCode, debit: net, amountBeforeVat: net, vatAmount: 0, isEquipment,
          taxPercent: taxPct, vatPercent: vatPct, amountForTax, subCategoryName: expense.subCategory ?? null },
        { accountCode: '2410', debit: vatInput, amountBeforeVat: 0, vatAmount: vatInput, isEquipment,
          taxPercent: 0, vatPercent: vatPct, amountForTax: 0, subCategoryName: null },
        { accountCode: '1100', credit: total, amountBeforeVat: net, vatAmount: vatInput, isEquipment: false,
          taxPercent: 0, vatPercent: 0, amountForTax: 0, subCategoryName: null },
      ]
    : [
        { accountCode: expenseAccountCode, debit: total, amountBeforeVat: total, vatAmount: 0, isEquipment,
          taxPercent: taxPct, vatPercent: 0, amountForTax, subCategoryName: expense.subCategory ?? null },
        { accountCode: '1100', credit: total, amountBeforeVat: total, vatAmount: 0, isEquipment: false,
          taxPercent: 0, vatPercent: 0, amountForTax: 0, subCategoryName: null },
      ];
}
```

`buildJournalEntryInput` (private, `expenses.service.ts:1013`):

```ts
private async buildJournalEntryInput(expense: Expense): Promise<JournalEntryInput> {
  const journalLines = await this.buildExpenseJournalLines(expense);
  const expenseDateSql = this.sharedService.normalizeToMySqlDate(expense.date);
  const vatReportingPeriod = await this.resolveExpenseVatReportingPeriod(expense);
  const subCounterAccountCode = await this.resolveSubAccountCode(expense.category, expense.subCategory);
  return {
    firebaseId: expense.userId,
    issuerBusinessNumber: expense.businessNumber,
    subCategory: expense.subCategory ?? null,
    counterAccountCode: '1100',
    subCounterAccountCode,
    counterPartyName: expense.supplier ?? null,
    documentTotal: expense.sum,
    date: expenseDateSql, valueDate: expenseDateSql, vatDate: expenseDateSql,
    vatReportingPeriod,
    referenceType: JournalReferenceType.EXPENSE,
    referenceId: Number(expense.expenseNumber) || expense.id,
    description: `EXPENSE #${expense.expenseNumber ?? expense.id} - ${expense.supplier ?? ''}`,
    lines: journalLines,
  };
}
```

Field breakdown:
- **Computed automatically**: `net` (total − deductible VAT), `hasVat`, line split (2 or 3
  lines), `expenseAccountCode` (via `resolveAccountCode`), `subCounterAccountCode` (via
  `resolveSubAccountCode`), `vatReportingPeriod` (via `resolveExpenseVatReportingPeriod`).
- **Copied from source expense**: `sum`→total/documentTotal, `totalVatPayable`→vatInput,
  `totalTaxPayable`→amountForTax, `isEquipment`, `taxPercent`, `vatPercent`,
  `category`/`subCategory`, `supplier`→counterPartyName, `date`, `userId`→firebaseId,
  `businessNumber`→issuerBusinessNumber, `expenseNumber`→referenceId.
- **Constants/defaults**: `counterAccountCode: '1100'` (always bank, hardcoded — cash/
  credit-card accounts `1110`/`1120` exist in the chart but are never used), `referenceType:
  JournalReferenceType.EXPENSE`, VAT input account `'2410'` (hardcoded), fallback expense
  account `'5000'`.

Entry points: `createExpenseJournalEntry` (new entry, `expenses.service.ts:1047`) and
`syncExpenseJournalEntry` (re-sync on edit, `expenses.service.ts:1098`, 3-step lookup: by
`journalEntryNumber` → by `referenceType+referenceId` → create fresh).

### Document path

`buildDocumentJournalLines` (exported, `backend/src/documents/documents.service.ts:48-112`):

```ts
export function buildDocumentJournalLines(params: {
  docType: DocumentType;
  parentDocType?: DocumentType | null;
  net: number;
  vat: number;
  full: number;
  isLicensed: boolean;
}): { journalLines: any[]; counterAccountCode: string | null } | null {
  const { docType, parentDocType, net, vat, full, isLicensed } = params;
  const isReceipt    = docType === DocumentType.RECEIPT;
  const isCreditNote = docType === DocumentType.CREDIT_INVOICE;

  if (isReceipt && isLicensed) {
    // Licensed RECEIPT: bank receives payment (1100), clears A/R opened by TAX_INVOICE (1200).
    return {
      counterAccountCode: null,
      journalLines: [
        { accountCode: '1100', debit: full,  amountBeforeVat: 0, vatAmount: 0, isEquipment: false, taxPercent: 0, vatPercent: 0, amountForTax: 0, subCategoryName: null },
        { accountCode: '1200', credit: full, amountBeforeVat: 0, vatAmount: 0, isEquipment: false, taxPercent: 0, vatPercent: 0, amountForTax: 0, subCategoryName: null },
      ],
    };
  }

  if (isReceipt) {
    // Exempt RECEIPT: cash-basis income — bank receives payment, income recognized.
    return {
      counterAccountCode: '1100',
      journalLines: [
        { accountCode: '1100', debit: net,  amountBeforeVat: 0, vatAmount: 0, isEquipment: false, taxPercent: 0, vatPercent: 0, amountForTax: 0, subCategoryName: null },
        { accountCode: '4000', credit: net, amountBeforeVat: net, vatAmount: 0, isEquipment: false, taxPercent: 100, vatPercent: 0, amountForTax: net, subCategoryName: null },
      ],
    };
  }

  if (isCreditNote) {
    // Use the PARENT document's type to pick the right counter account.
    const counterCode = parentDocType === DocumentType.TAX_INVOICE_RECEIPT ? '1100' : '1200';
    return {
      counterAccountCode: counterCode,
      journalLines: [
        { accountCode: counterCode, credit: full, amountBeforeVat: 0, vatAmount: 0, isEquipment: false, taxPercent: 0, vatPercent: 0, amountForTax: 0, subCategoryName: null },
        { accountCode: '4000',      debit: net,  amountBeforeVat: net, vatAmount: 0,   isEquipment: false, taxPercent: 100, vatPercent: 100, amountForTax: net, subCategoryName: null },
        ...(vat > 0 ? [{ accountCode: '2400', debit: vat, amountBeforeVat: 0, vatAmount: vat, isEquipment: false, taxPercent: 0, vatPercent: 100, amountForTax: 0, subCategoryName: null }] : []),
      ],
    };
  }

  if (docType === DocumentType.TAX_INVOICE || docType === DocumentType.TAX_INVOICE_RECEIPT) {
    const counterCode = docType === DocumentType.TAX_INVOICE_RECEIPT ? '1100' : '1200';
    return {
      counterAccountCode: counterCode,
      journalLines: [
        { accountCode: counterCode, debit: full, amountBeforeVat: 0, vatAmount: 0, isEquipment: false, taxPercent: 0, vatPercent: 0, amountForTax: 0, subCategoryName: null },
        { accountCode: '4000',      credit: net, amountBeforeVat: net, vatAmount: 0,   isEquipment: false, taxPercent: 100, vatPercent: 100, amountForTax: net, subCategoryName: null },
        ...(vat > 0 ? [{ accountCode: '2400', credit: vat, amountBeforeVat: 0, vatAmount: vat, isEquipment: false, taxPercent: 0, vatPercent: 100, amountForTax: 0, subCategoryName: null }] : []),
      ],
    };
  }

  return null; // TRANSACTION_INVOICE, PRICE_QUOTE, WORK_ORDER — no journal entry at all
}
```

`4000` (income) and `2400` (VAT-on-sales) are hardcoded constants; `1100`/`1200` chosen
conditionally as counter account.

---

## 4. `resolveAccountCode()`

`backend/src/expenses/expenses.service.ts:877-920`:

```ts
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
        const defaultCat = await this.defaultCategoryRepo.findOne({ where: { categoryName: category } });
        if (defaultCat?.accountCode) return defaultCat.accountCode;
    }

    // 5. final fallback
    return '5000';
}
```

**Parameters**: `categoryName`, `subCategoryName` (both used for lookups), `firebaseId`/
`businessNumber` (optional — only used for the two "user override" steps).

**Priority (first non-empty wins)**:
1. `user_sub_category.accountCode` (per-business sub-category override)
2. `default_sub_category.accountCode` (global sub-category mapping)
3. `user_category.accountCode` (per-business category override)
4. `default_category.accountCode` (global category default)
5. `'5000'` hardcoded fallback (unidentified expense)

⚠️ Note the documented quirk: global sub-category (step 2) outranks the user's own
category-level override (step 3) — intentional, not a bug, per `docs/bookkeeping-system.md`
section 4.

There's a sibling helper for the sub-ledger code, not part of `resolveAccountCode` itself:

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
(`expenses.service.ts:928` — global-catalog-only lookup against
`default_sub_category.subAccountCode`, returns `null` if unmapped.)

---

## 5. Counter account (חשבון נגד) mechanism

There's no config file/constants table for this — it's **inline conditional logic per
journal-reference-type**, hardcoded as literal account-code strings:

| Reference type | Counter account logic | Where |
|---|---|---|
| `EXPENSE` | Always `'1100'` (bank) — hardcoded constant, no branching by payment method | `buildJournalEntryInput`, `expenses.service.ts:1022` |
| `RECEIPT` | Licensed: `null` header value (bank↔A/R both appear as lines, no single "counter"); Exempt: `'1100'` | `buildDocumentJournalLines`, `documents.service.ts:60-80` |
| `TAX_INVOICE`/`TAX_INVOICE_RECEIPT` | `docType === TAX_INVOICE_RECEIPT ? '1100' : '1200'` | `documents.service.ts:100` |
| `CREDIT_INVOICE` | `parentDocType === TAX_INVOICE_RECEIPT ? '1100' : '1200'` (mirrors the original doc it reverses) | `documents.service.ts:86` |

Key facts for the manual form:
- `1110` (cash) and `1120` (credit-card) exist in the chart (`account.seed.ts`) but **are
  never actually posted to** — everything funnels to `1100`.
- `2000` (suppliers/A-P) is never used — no deferred-payment expense model exists.
- There is **no shared "pick the default counter account" function** — each caller inlines
  its own ternary. There's no system-wide default to fall back on for a manual form; the
  closest existing convention is bank `1100` for cash-basis-style entries, `1200` for A/R.
- For a genuinely one-sided manual entry (no counter-account at all, per the user's
  request), this mechanism can be skipped entirely — `JournalEntry.counterAccountCode` is
  nullable and purely informational for ledger display (proven by `RECEIPT`'s `null` case
  above, which already tolerates "no single counter").

---

## 6. Validation

**There is no validation logic inside the bookkeeping module itself.** Grepping
`bookkeeping.service.ts` and its spec for `validate`/`assert`/balance-checking returns
nothing. The only guard `persistJournalEntry` performs is
`bookingAccountRepo.findOneByOrFail({ code })` — i.e. it throws only if an `accountCode`
doesn't exist in `default_booking_account`. There is:
- No debit=credit balance check anywhere in `BookkeepingService` (callers are trusted to
  already balance their lines).
- No VAT-consistency check (e.g. verifying `vatAmount` matches `amountBeforeVat ×
  vatPercent`).
- No `isEquipment` validation.

The frontend scaffold at `frontend/src/app/pages/ledger-report/ledger-report.page.ts:576-582`
documents the intended single-sided behavior explicitly:

```ts
/** Single-entry: no debit=credit balancing required. The only gate on שמור is
 *  that at least one line carries an amount. */
get hasAnyAmount(): boolean {
  return this.journalEntryForm.lines.some(
    (l) => (Number(l.debit) || 0) !== 0 || (Number(l.credit) || 0) !== 0,
  );
}
```

So the existing UI intent already matches "no counter-account, no balance requirement" —
this is extending an already-anticipated design, not inventing a new mode.

VAT/equipment *defaults* (not validation) do exist upstream in category seeding —
`SUBCATEGORY_VAT_DEFAULTS` in `backend/src/bookkeeping/account-seed.service.ts` — but that
only seeds `default_sub_category.vatPercent`/`taxPercent`; it doesn't validate
journal-entry input.

---

## 7. Controller/Endpoint

**No manual-entry endpoint exists.** `backend/src/bookkeeping/bookkeeping.controller.ts` is
a completely empty shell:

```ts
@Controller('bookkeeping')
export class BookkepingController {
  constructor(private readonly bookkeepingService: BookkeepingService) {}
}
```

`JournalReferenceType.MANUAL` is defined in the enum (`backend/src/enum.ts:167`) but is
never referenced anywhere else in the codebase.

**Closest existing pieces to build on:**

- **Frontend is already wired for it**:
  `frontend/src/app/pages/ledger-report/ledger-report.page.ts:518-588` has a full modal
  form (`journalEntryForm`, `addLine`/`removeLine`, `totalDebit`/`totalCredit`,
  `hasAnyAmount` gate) whose `saveJournalEntry()` currently only `console.log`s the payload
  and closes the modal — this is the exact form to wire an endpoint into:

  ```ts
  private buildEmptyJournalEntry() {
    const today = this.todayStr();
    return {
      date: today, valueDate: today, vatDate: today,
      description: '', notes: '',
      lines: [
        { accountCode: '', description: '', debit: 0, credit: 0 },
        { accountCode: '', description: '', debit: 0, credit: 0 },
      ],
    };
  }

  saveJournalEntry(): void {
    // Scaffolding: log the payload; API wiring comes in the next task.
    console.log('[ledger] manual journal entry (scaffold):', JSON.parse(JSON.stringify(this.journalEntryForm)));
    this.closeJournalEntryModal();
  }
  ```

- **Account dropdown endpoint already exists**: `GET /reports/ledger-entry-accounts`
  (`reports.controller.ts:433` → `reportsService.getLedgerEntryAccounts()`,
  `reports.service.ts:906`) — returns posting accounts only (`pnlCategory IS NOT NULL`),
  already consumed by `journalAccountOptions` in the frontend page.

- **Service method to call**: `BookkeepingService.createJournalEntry(input:
  JournalEntryInput)` is the exact entry point — it already accepts a fully generic
  `JournalEntryInput` with no per-source-type coupling, so a manual-entry endpoint just
  needs to build one of these directly from the form (with `referenceType:
  JournalReferenceType.MANUAL`, `referenceId` set to something synthetic since manual
  entries have no source row, `counterAccountCode: null`, and lines with only
  `accountCode`/`debit`/`credit` populated — everything else defaults via the same
  `?? `/`|| 0` fallbacks already in `persistJournalEntry`).
