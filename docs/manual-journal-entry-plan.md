# Manual Journal Entry — Implementation Plan (pending approval)

Plan to wire the existing manual journal-entry modal scaffold
(`frontend/src/app/pages/ledger-report/ledger-report.page.ts:518-588`, HTML around
lines 222-305) to a real backend endpoint, using `entryKind: 'income' | 'income_exempt' |
'expense'` to drive which fields show and how the journal line is built. No new
form/modal — extends the existing one. Not yet applied — see
`docs/manual-journal-entry-research.md` for the prior research this builds on.

---

## Judgment calls made beyond the spec (flag before applying)

1. **`referenceId` nullable** — currently `@Column({ type: 'bigint' }) referenceId: number`
   (NOT nullable yet, despite the premise that prompted this task). Making it
   `nullable: true` as part of this change, since `MANUAL` entries have no source row.

2. **VAT is posted as a real second journal line, not metadata — and the rate is
   never hardcoded.** `createManualJournalEntry` builds 1 or 2 real `JournalLineInput`
   rows per user-entered line, the same shape `buildExpenseJournalLines`/
   `buildDocumentJournalLines` already produce: line 1 is the user's chosen P&L account
   (net of VAT, exactly like every other P&L line in the system); line 2 — added
   automatically by the service, never chosen by the user — is `2400` (output VAT, for
   `income`) or `2410` (input VAT, for `expense`), only when the computed VAT amount is
   `> 0`. The national VAT rate is pulled from the **existing** single source of truth,
   `this.sharedService.getVatRateByYear(new Date(dto.date))` (backed by `VAT_RATES` in
   `backend/src/enum.ts`, currently 0.18 for 2025-2027) — never a hardcoded literal and
   never the dead, stale `VAT_RATE_2023 = 0.17` in `constants.ts` (confirmed zero
   usages anywhere in the codebase; not touched by this change). `vatPercent` (0-100,
   the user-entered "% מוכר למע"מ") stays completely separate from that rate:
   `vatAmount = net × vatRate × (vatPercent / 100)`. Because a real `2410`/`2400` line
   now exists, manual entries correctly feed the automated VAT report too (it reads
   exactly those account codes) — this removes the earlier gap where a metadata-only
   `vatAmount` would never have shown up there.

3. **Debit/credit collapse to one "amount" field per line.** Since `entryKind` now fixes
   the direction (income→credit, expense→debit), replacing the two always-editable
   debit/credit inputs with a single amount input avoids the user having to remember
   which column to leave at 0.

4. **`subCategoryName` is a free-text input**, not a category dropdown — there's no
   existing category-list endpoint wired into this page, and no new lookup endpoint
   beyond `ledger-entry-accounts` was to be added.

5. **Minimum lines: 2 → 1.** The old scaffold forced ≥2 lines (leftover double-entry
   assumption); a single-sided entry has no such requirement.

6. **New backend safety check**: each line's `accountCode` must resolve to an account
   whose `type` matches the entry kind (`income`/`income_exempt` → `type: 'income'`;
   `expense` → `type: 'expense'`) — blocks silently posting into a technical/asset/
   liability account via this endpoint, since nothing else validates that today.

---

## Show/hide matrix driving the implementation

| entryKind | direction | subCategoryName | isEquipment | vatPercent | vatReportingPeriod |
|---|---|---|---|---|---|
| `income` | credit | hidden/null | hidden/false | editable, default 100 | required |
| `income_exempt` | credit | hidden/null | hidden/false | fixed 0 | fixed null |
| `expense` | debit | shown, free text | shown, checkbox | editable | required only if a `2410` VAT line was added (amount != 0 and vatPercent > 0) |

Note: "vatPercent > 0" is the only condition that matters for whether a VAT line gets
added — the national rate (`getVatRateByYear`) is never 0 for any year currently
configured in `VAT_RATES`, so the frontend's "is vatReportingPeriod required" hint
never needs to know the actual rate value, only whether `amount != 0` and
`vatPercent > 0`.

---

## Backend changes

### 1. `backend/src/bookkeeping/jouranl-entry.entity.ts`

```diff
-  @Column({ type: 'bigint' })
-  referenceId: number; // The ID of the invoice/receipt/expense etc
+  @Column({ type: 'bigint', nullable: true })
+  referenceId: number | null; // The ID of the invoice/receipt/expense etc; null for MANUAL entries
```

### 2. `backend/src/bookkeeping/dto/journal-entry-input.interface.ts`

```diff
-  referenceId?: number;
+  referenceId?: number | null;
```

### 3. `backend/src/bookkeeping/dto/manual-journal-entry.dto.ts` (new file)

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export type ManualJournalEntryKind = 'income' | 'income_exempt' | 'expense';

export class ManualJournalLineDto {
  @IsString()
  @IsNotEmpty()
  accountCode: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** The line's posted amount, net of VAT — same convention as every other
   *  P&L-account line in the system (buildExpenseJournalLines,
   *  buildDocumentJournalLines). Assigned to debit or credit based on the
   *  entry's kind. */
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  subCategoryName?: string | null;

  @IsOptional()
  @IsBoolean()
  isEquipment?: boolean;

  /** % recognized for VAT (0-100). Ignored (forced 0) for income_exempt. */
  @IsOptional()
  @IsNumber()
  vatPercent?: number;
}

export class CreateManualJournalEntryDto {
  @IsIn(['income', 'income_exempt', 'expense'])
  entryKind: ManualJournalEntryKind;

  @IsOptional()
  @IsString()
  businessNumber?: string;

  @IsString()
  date: string;

  @IsOptional()
  @IsString()
  valueDate?: string;

  @IsOptional()
  @IsString()
  vatDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** VAT/income reporting-period label ("3/2026" etc). Required for `income`;
   *  required for `expense` only when a line's derived vatAmount > 0; forced
   *  null for `income_exempt`. */
  @IsOptional()
  @IsString()
  vatReportingPeriod?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualJournalLineDto)
  lines: ManualJournalLineDto[];
}
```

### 4. `backend/src/bookkeeping/bookkeeping.service.ts` — new method

```diff
-import { Injectable } from '@nestjs/common';
+import { BadRequestException, Injectable } from '@nestjs/common';
 import { InjectRepository } from '@nestjs/typeorm';
 import { DataSource, Repository } from 'typeorm';
 import { JournalEntry } from './jouranl-entry.entity';
 import { JournalLine } from './jouranl-line.entity';
 import { DefaultBookingAccount } from './account.entity';
 import { SharedService } from '../shared/shared.service';
 import { JournalEntryInput, JournalLineInput } from './dto/journal-entry-input.interface';
+import { CreateManualJournalEntryDto } from './dto/manual-journal-entry.dto';
 import { JournalReferenceType } from '../enum';
 import { EntityManager } from 'typeorm';
```

Note: no import of `VAT_RATE_2023` — the rate comes from `this.sharedService`, which
`BookkeepingService` already has injected via its constructor.

```diff
@@ (append as a new public method, after createJournalEntry / before replaceJournalEntryLines)
+
+  /**
+   * Build and post a manual, single-sided (חד-צידית) journal entry — no
+   * counter-account, but a REAL VAT line when applicable. Each user-entered
+   * line becomes 1 or 2 JournalLineInput rows, same shape as
+   * buildExpenseJournalLines/buildDocumentJournalLines:
+   *   - line 1: the user's chosen P&L account, net of VAT (matches every
+   *     other P&L line in the system — VAT is never mixed into it).
+   *   - line 2 (only when the computed vatAmount > 0): the technical VAT
+   *     account — '2400' (output VAT) for income, '2410' (input VAT) for
+   *     expense — added automatically here, never chosen by the user.
+   * The national VAT rate comes from the existing single source of truth
+   * (SharedService.getVatRateByYear / VAT_RATES in enum.ts), never a
+   * hardcoded literal. vatPercent (0-100, user-entered "% מוכר למע"מ") is
+   * unrelated to that rate: vatAmount = net × vatRate × (vatPercent / 100).
+   */
+  async createManualJournalEntry(
+    dto: CreateManualJournalEntryDto,
+    firebaseId: string,
+    issuerBusinessNumber: string,
+  ): Promise<{ entryNumber: number; id: number }> {
+    const isExpense = dto.entryKind === 'expense';
+    const isExempt = dto.entryKind === 'income_exempt';
+    const expectedType = isExpense ? 'expense' : 'income';
+    const vatAccountCode = isExpense ? '2410' : '2400';
+
+    if (!dto.lines?.length) {
+      throw new BadRequestException('At least one line is required');
+    }
+
+    const vatRate = this.sharedService.getVatRateByYear(new Date(dto.date));
+
+    const lines: JournalLineInput[] = [];
+    let anyVatLine = false;
+
+    for (const line of dto.lines) {
+      const net = Number(line.amount) || 0;
+      if (!line.accountCode || net === 0) continue;
+
+      // Safety net: the manual-entry dropdown is meant to only offer
+      // postable P&L accounts, but nothing stops a client from sending an
+      // arbitrary code directly — reject anything that isn't a real,
+      // kind-matching posting account (blocks silently posting into
+      // technical/asset/liability accounts via this path).
+      const account = await this.defaultBookingAccountRepo.findOneByOrFail({ code: line.accountCode });
+      if (!account.pnlCategory || account.type !== expectedType) {
+        throw new BadRequestException(
+          `Account ${line.accountCode} is not a valid ${expectedType} posting account`,
+        );
+      }
+
+      const vatPercent = isExempt ? 0 : Number(line.vatPercent ?? 100);
+      const vatAmount = isExempt ? 0 : Number((net * vatRate * (vatPercent / 100)).toFixed(2));
+      const isEquipment = isExpense ? !!line.isEquipment : false;
+
+      // Line 1: the P&L account itself, always net of VAT.
+      lines.push({
+        accountCode: line.accountCode,
+        debit: isExpense ? net : 0,
+        credit: isExpense ? 0 : net,
+        amountBeforeVat: net,
+        vatAmount: 0,
+        isEquipment,
+        taxPercent: 100,
+        vatPercent,
+        amountForTax: net, // full recognition — manual entries don't expose a separate taxPercent input
+        subCategoryName: isExpense ? (line.subCategoryName?.trim() || null) : null,
+      });
+
+      // Line 2: the real VAT line — added automatically, never user-chosen.
+      if (vatAmount > 0) {
+        anyVatLine = true;
+        lines.push({
+          accountCode: vatAccountCode,
+          debit: isExpense ? vatAmount : 0,
+          credit: isExpense ? 0 : vatAmount,
+          amountBeforeVat: 0,
+          vatAmount,
+          isEquipment,
+          taxPercent: 0,
+          vatPercent,
+          amountForTax: 0,
+          subCategoryName: null,
+        });
+      }
+    }
+
+    if (!lines.length) {
+      throw new BadRequestException('At least one line with an account and a non-zero amount is required');
+    }
+
+    const vatReportingPeriod = isExempt ? null : (dto.vatReportingPeriod?.trim() || null);
+    if (!isExempt) {
+      const periodRequired = dto.entryKind === 'income' || anyVatLine;
+      if (periodRequired && !vatReportingPeriod) {
+        throw new BadRequestException('vatReportingPeriod is required for this entry');
+      }
+    }
+
+    // Sums both the P&L line and (when present) its VAT line, so this comes
+    // out as the true gross total — unlike a single-line design, no separate
+    // computation is needed.
+    const documentTotal = lines.reduce((sum, l) => sum + (l.debit || l.credit || 0), 0);
+
+    const input: JournalEntryInput = {
+      firebaseId,
+      issuerBusinessNumber,
+      subCategory: null,
+      counterAccountCode: null,
+      subCounterAccountCode: null,
+      counterPartyName: null,
+      documentTotal,
+      date: dto.date,
+      valueDate: dto.valueDate || dto.date,
+      vatDate: dto.vatDate || dto.date,
+      notes: dto.notes ?? undefined,
+      vatReportingPeriod,
+      referenceType: JournalReferenceType.MANUAL,
+      referenceId: null,
+      description: dto.description || '',
+      lines,
+    };
+
+    return this.createJournalEntry(input);
+  }
```

### 5. `backend/src/bookkeeping/bookkeeping.controller.ts`

```diff
-import { Body, Controller, Get, Headers, Param, Patch, Post, Req, Res, UseGuards, } from '@nestjs/common';
+import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Req, Res, UnauthorizedException, UseGuards, } from '@nestjs/common';
 import { BookkeepingService } from './bookkeeping.service';
+import { CreateManualJournalEntryDto } from './dto/manual-journal-entry.dto';
 import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
 import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
 
 
 
 @Controller('bookkeeping')
 export class BookkepingController {
   constructor(
     private readonly bookkeepingService: BookkeepingService,
   ) { }
 
+  /** Manual, single-sided journal entry (no counter-account) — for cases the
+   *  automatic EXPENSE/document postings don't cover. */
+  @Post('manual-journal-entry')
+  @UseGuards(FirebaseAuthGuard)
+  async createManualJournalEntry(
+    @Req() request: AuthenticatedRequest,
+    @Body() body: CreateManualJournalEntryDto,
+  ): Promise<{ entryNumber: number; id: number }> {
+    const firebaseId = request.user?.firebaseId;
+    if (!firebaseId) throw new UnauthorizedException('Not authenticated');
+    const businessNumber = body.businessNumber?.trim() || request.user?.businessNumber;
+    if (!businessNumber) throw new BadRequestException('businessNumber is required');
+    return this.bookkeepingService.createManualJournalEntry(body, firebaseId, businessNumber);
+  }
+
 }
```

---

## Frontend changes

### 6. `frontend/src/app/pages/ledger-report/ledger-report.service.ts`

```diff
+export type ManualJournalEntryKind = 'income' | 'income_exempt' | 'expense';
+
+export interface IManualJournalLinePayload {
+  accountCode: string;
+  description?: string;
+  amount: number;
+  subCategoryName?: string | null;
+  isEquipment?: boolean;
+  vatPercent?: number;
+}
+
+export interface ICreateManualJournalEntryPayload {
+  entryKind: ManualJournalEntryKind;
+  businessNumber: string;
+  date: string;
+  valueDate?: string;
+  vatDate?: string;
+  description?: string;
+  notes?: string;
+  vatReportingPeriod?: string | null;
+  lines: IManualJournalLinePayload[];
+}
+
 @Injectable({
   providedIn: 'root'
 })
 export class LedgerReportService {
@@
   /** Fetch all lines of a journal entry for the detail modal. */
   getJournalEntryDetail(
     businessNumber: string,
     entryId: number,
   ): Observable<IJournalEntryDetail> {
     const url = `${environment.apiUrl}reports/journal-entry/${entryId}`;
     const params = new HttpParams().set('businessNumber', businessNumber);
     return this.http.get<IJournalEntryDetail>(url, { params });
   }
 
+  /** Post a manual, single-sided journal entry (no counter-account). */
+  createManualJournalEntry(
+    payload: ICreateManualJournalEntryPayload,
+  ): Observable<{ entryNumber: number; id: number }> {
+    const url = `${environment.apiUrl}bookkeeping/manual-journal-entry`;
+    return this.http.post<{ entryNumber: number; id: number }>(url, payload);
+  }
+
 }
```

### 7. `frontend/src/app/pages/ledger-report/ledger-report.page.ts`

```diff
-import { IJournalEntryDetail, ILedgerLine, ILedgerReport, LedgerReportService } from './ledger-report.service';
+import {
+  ICreateManualJournalEntryPayload,
+  IJournalEntryDetail,
+  ILedgerLine,
+  ILedgerReport,
+  LedgerReportService,
+  ManualJournalEntryKind,
+} from './ledger-report.service';
```

```diff
   showJournalEntryModal = false;
 
   journalEntryForm = this.buildEmptyJournalEntry();
 
   /** today as YYYY-MM-DD for the native date inputs' default value. */
   private todayStr(): string {
     return new Date().toISOString().slice(0, 10);
   }
 
   private buildEmptyJournalEntry() {
     const today = this.todayStr();
     return {
+      entryKind: 'expense' as ManualJournalEntryKind,
       date: today,
       valueDate: today,
       vatDate: today,
       description: '',
       notes: '',
-      lines: [
-        { accountCode: '', description: '', debit: 0, credit: 0 },
-        { accountCode: '', description: '', debit: 0, credit: 0 },
-      ],
+      vatReportingPeriod: '',
+      lines: [this.buildEmptyJournalLine()],
     };
   }
 
+  private buildEmptyJournalLine() {
+    return { accountCode: '', description: '', amount: 0, subCategoryName: '', isEquipment: false, vatPercent: 100 };
+  }
+
   /** Account options for the journal line dropdowns — posting accounts only
    *  (from /reports/ledger-entry-accounts; technical accounts excluded). */
   get journalAccountOptions(): ISelectItem[] {
     return this.entryAccountOptions();
   }
 
   openJournalEntryModal(): void {
     this.showJournalEntryModal = true;
   }
 
   closeJournalEntryModal(): void {
     this.journalEntryForm = this.buildEmptyJournalEntry();
     this.showJournalEntryModal = false;
   }
 
   addLine(): void {
-    this.journalEntryForm.lines.push({ accountCode: '', description: '', debit: 0, credit: 0 });
+    this.journalEntryForm.lines.push(this.buildEmptyJournalLine());
   }
 
-  /** Remove a line, keeping a minimum of 2 lines. */
+  /** Remove a line, keeping a minimum of 1 line — single-sided entries need no offsetting line. */
   removeLine(index: number): void {
-    if (this.journalEntryForm.lines.length > 2) {
+    if (this.journalEntryForm.lines.length > 1) {
       this.journalEntryForm.lines.splice(index, 1);
     }
   }
 
-  get totalDebit(): number {
-    return this.journalEntryForm.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
-  }
-
-  get totalCredit(): number {
-    return this.journalEntryForm.lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
+  get totalAmount(): number {
+    return this.journalEntryForm.lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
   }
 
   /** Single-entry: no debit=credit balancing required. The only gate on שמור is
    *  that at least one line carries an amount. */
   get hasAnyAmount(): boolean {
     return this.journalEntryForm.lines.some(
-      (l) => (Number(l.debit) || 0) !== 0 || (Number(l.credit) || 0) !== 0,
+      (l) => !!l.accountCode && (Number(l.amount) || 0) !== 0,
     );
   }
 
-  saveJournalEntry(): void {
-    // Scaffolding: log the payload; API wiring comes in the next task.
-    console.log('[ledger] manual journal entry (scaffold):', JSON.parse(JSON.stringify(this.journalEntryForm)));
-    this.closeJournalEntryModal();
+  get showVatReportingPeriod(): boolean {
+    return this.journalEntryForm.entryKind !== 'income_exempt';
+  }
+
+  /** The national VAT rate is never 0 for any currently-configured year, so
+   *  whether a VAT line gets added server-side comes down to just these two
+   *  checks — no need to duplicate the rate itself on the frontend. */
+  get vatReportingPeriodRequired(): boolean {
+    if (this.journalEntryForm.entryKind === 'income') return true;
+    if (this.journalEntryForm.entryKind === 'income_exempt') return false;
+    return this.journalEntryForm.lines.some(
+      (l) => (Number(l.amount) || 0) !== 0 && (Number(l.vatPercent) || 0) > 0,
+    );
+  }
+
+  saveJournalEntry(): void {
+    if (!this.hasAnyAmount || !this.businessNumber()) return;
+
+    const isExpense = this.journalEntryForm.entryKind === 'expense';
+    const isExempt = this.journalEntryForm.entryKind === 'income_exempt';
+
+    const lines = this.journalEntryForm.lines
+      .filter((l) => l.accountCode && (Number(l.amount) || 0) !== 0)
+      .map((l) => ({
+        accountCode: l.accountCode,
+        description: l.description || undefined,
+        amount: Number(l.amount) || 0,
+        subCategoryName: isExpense ? (l.subCategoryName || null) : null,
+        isEquipment: isExpense ? !!l.isEquipment : false,
+        vatPercent: isExempt ? 0 : Number(l.vatPercent) || 0,
+      }));
+
+    const payload: ICreateManualJournalEntryPayload = {
+      entryKind: this.journalEntryForm.entryKind,
+      businessNumber: this.businessNumber(),
+      date: this.journalEntryForm.date,
+      valueDate: this.journalEntryForm.valueDate,
+      vatDate: this.journalEntryForm.vatDate,
+      description: this.journalEntryForm.description,
+      notes: this.journalEntryForm.notes,
+      vatReportingPeriod: isExempt ? null : (this.journalEntryForm.vatReportingPeriod || null),
+      lines,
+    };
+
+    this.genericService.getLoader().subscribe();
+    this.ledgerReportService.createManualJournalEntry(payload)
+      .pipe(
+        finalize(() => this.genericService.dismissLoader()),
+        catchError((err) => {
+          this.genericService.showToast(err?.error?.message || 'שמירת הפקודה נכשלה', 'error');
+          return EMPTY;
+        }),
+      )
+      .subscribe((res) => {
+        if (!res) return;
+        this.genericService.showToast('פקודת היומן נשמרה בהצלחה', 'success');
+        this.closeJournalEntryModal();
+        if (this.isRequestSent()) {
+          this.getLedgerReportData(this.startDate(), this.endDate(), this.businessNumber(), this.selectedAccountCode());
+        }
+      });
   }
 }
```

### 8. `frontend/src/app/pages/ledger-report/ledger-report.page.html`

```diff
   <div dir="rtl" class="je-modal">
 
       <!-- Header fields -->
       <div class="je-header-grid">
+        <label class="je-field">
+          <span>סוג פקודה</span>
+          <select [(ngModel)]="journalEntryForm.entryKind">
+            <option value="income">הכנסה (חייבת במע"מ)</option>
+            <option value="income_exempt">הכנסה פטורה ממע"מ</option>
+            <option value="expense">הוצאה</option>
+          </select>
+        </label>
         <label class="je-field">
           <span>תאריך</span>
           <input type="date" [(ngModel)]="journalEntryForm.date" />
         </label>
         <label class="je-field">
           <span>תאריך ערך</span>
           <input type="date" [(ngModel)]="journalEntryForm.valueDate" />
         </label>
         <label class="je-field">
           <span>תאריך למע"מ</span>
           <input type="date" [(ngModel)]="journalEntryForm.vatDate" />
         </label>
         <label class="je-field">
           <span>פרטים</span>
           <input type="text" [(ngModel)]="journalEntryForm.description" />
         </label>
         <label class="je-field">
           <span>הערות</span>
           <input type="text" [(ngModel)]="journalEntryForm.notes" />
         </label>
+        <label class="je-field" *ngIf="showVatReportingPeriod">
+          <span>תקופת דיווח למע"מ{{ vatReportingPeriodRequired ? ' *' : '' }}</span>
+          <input type="text" placeholder='לדוגמה: 3/2026' [(ngModel)]="journalEntryForm.vatReportingPeriod" />
+        </label>
       </div>
 
       <!-- Lines -->
       <table class="je-lines">
         <thead>
           <tr>
             <th>כרטיס חשבון</th>
+            <th *ngIf="journalEntryForm.entryKind === 'expense'">תת-קטגוריה</th>
             <th>פרטים</th>
-            <th>חובה</th>
-            <th>זכות</th>
+            <th>{{ journalEntryForm.entryKind === 'expense' ? 'חובה' : 'זכות' }}</th>
+            <th *ngIf="journalEntryForm.entryKind !== 'income_exempt'">% מוכר למע"מ</th>
+            <th *ngIf="journalEntryForm.entryKind === 'expense'">ציוד</th>
             <th></th>
           </tr>
         </thead>
         <tbody>
           <tr *ngFor="let line of journalEntryForm.lines; let i = index">
             <td>
               <select [(ngModel)]="line.accountCode">
                 <option value="">בחר חשבון</option>
                 <option *ngFor="let acc of journalAccountOptions" [value]="acc.value">{{ acc.name }}</option>
               </select>
             </td>
+            <td *ngIf="journalEntryForm.entryKind === 'expense'">
+              <input type="text" [(ngModel)]="line.subCategoryName" />
+            </td>
             <td><input type="text" [(ngModel)]="line.description" /></td>
-            <td><input type="number" dir="ltr" [(ngModel)]="line.debit" /></td>
-            <td><input type="number" dir="ltr" [(ngModel)]="line.credit" /></td>
+            <td><input type="number" dir="ltr" [(ngModel)]="line.amount" /></td>
+            <td *ngIf="journalEntryForm.entryKind !== 'income_exempt'">
+              <input type="number" dir="ltr" min="0" max="100" [(ngModel)]="line.vatPercent" />
+            </td>
+            <td *ngIf="journalEntryForm.entryKind === 'expense'">
+              <input type="checkbox" [(ngModel)]="line.isEquipment" />
+            </td>
             <td>
               <button
                 type="button"
                 class="je-remove"
                 title="הסר שורה"
-                [disabled]="journalEntryForm.lines.length <= 2"
+                [disabled]="journalEntryForm.lines.length <= 1"
                 (click)="removeLine(i)">✕</button>
             </td>
           </tr>
         </tbody>
       </table>
 
       <button type="button" class="je-add-line" (click)="addLine()">+ שורה</button>
 
-      <!-- Running totals (reference only — single-entry, no balance requirement) -->
+      <!-- Running total (reference only — single-entry, no balance requirement) -->
       <div class="je-totals">
-        <span>סה"כ חובה: <b dir="ltr">{{ totalDebit | number:'1.2-2' }}</b></span>
-        <span>סה"כ זכות: <b dir="ltr">{{ totalCredit | number:'1.2-2' }}</b></span>
+        <span>{{ journalEntryForm.entryKind === 'expense' ? 'סה"כ חובה' : 'סה"כ זכות' }}: <b dir="ltr">{{ totalAmount | number:'1.2-2' }}</b></span>
       </div>
```

---

Everything else (the header comment block at `page.ts:486-489` calling it "UI scaffolding
only", `EXPENSE`/document logic, `resolveAccountCode`, `replaceJournalEntryLines`/
`updateJournalEntryFull`) stays untouched.
