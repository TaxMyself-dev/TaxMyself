import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** One movement row within an account's ledger card. */
export class LedgerLineDto {
    /** מספר פקודה — per-business journal entry running number (0 if legacy/null). */
    @IsNumber()
    entryNumber: number;

    /** תאריך יצירה — the journal entry date (JournalEntry.date). */
    @IsString()
    date: string;

    /** תאריך ערך (JournalEntry.valueDate). '' if null. */
    @IsString()
    valueDate: string;

    /** תאריך למע"מ (JournalEntry.vatDate). '' if null. */
    @IsString()
    vatDate: string;

    /** תקופת דיווח (JournalEntry.vatReportingPeriod, e.g. "1-2/2026"). '' if null. */
    @IsString()
    vatReportingPeriod: string;

    /** מספר הקצאה — tax-authority allocation number (Documents.allocationNum).
     *  '' for non-document entries or when the document has none. */
    @IsString()
    allocationNum: string;

    /** הערות (JournalEntry.notes). '' if null. */
    @IsString()
    notes: string;

    /** סוג מסמך — JournalEntry.referenceType (e.g. TAX_INVOICE, RECEIPT…). '' if null. */
    @IsString()
    referenceType: string;

    /** אסמכתא — JournalEntry.referenceId — the id of the source invoice/receipt/etc. */
    @IsNumber()
    referenceId: number;

    /** מפתח פנימי של פקודת היומן — לשליפת הפקודה המלאה. */
    @IsNumber()
    journalEntryId: number;

    /** פרטים — JournalEntry.description. '' if null. */
    @IsString()
    description: string;

    /** ח. נגדי — the single counter-account code for this entry (from je.counterAccountCode).
     *  Null for entries where no counter is applicable (e.g. licensed RECEIPT to 1100). */
    counterAccounts: string | null;

    /** ספק/לקוח — vendor or customer name (je.counterPartyName). */
    counterPartyName: string | null;

    /** תת קטגוריה — sub-category name from the source expense ("דלק", "ארנונה").
     *  Null for income-document lines and VAT (2410) lines. */
    subCategoryName: string | null;

    /** סוג תנועה — 'חובה' when debit > 0, otherwise 'זכות'. */
    @IsString()
    movementType: string;

    @IsNumber()
    debit: number;

    @IsNumber()
    credit: number;

    /** סה"כ בש"ח — max(debit, credit). */
    @IsNumber()
    totalAmount: number;

    /** מטבע — document currency (Documents.currency); 'ILS' for non-document / ILS rows. */
    @IsString()
    currency: string;

    /** שע"ח — exchange rate (docSumWithVat / amountForeign); 1 for ILS rows. */
    @IsNumber()
    exchangeRate: number;

    /** סכום לרוה"ס (JournalLine.amountBeforeVat). */
    @IsNumber()
    amountBeforeVat: number;

    /** סה"כ לרווח והפסד — tax-deductible amount (JournalLine.amountForTax). */
    @IsNumber()
    amountForTax: number;

    /** סכום למע"מ (JournalLine.vatAmount). */
    @IsNumber()
    vatAmount: number;

    /** % מס — tax deductibility percentage (JournalLine.taxPercent). */
    @IsNumber()
    taxPercent: number;

    /** % מע"מ — VAT deductibility percentage (JournalLine.vatPercent). */
    @IsNumber()
    vatPercent: number;

    /** סה"כ מסמך כולל מע"מ (JournalEntry.documentTotal). Null for entries without a source document. */
    documentTotal: number | null;

    /** יתרה — running balance WITHIN the requested period (resets per account). */
    @IsNumber()
    balance: number;

    /** יתרה לתקופה — opening balance (before startDate) + running balance. */
    @IsNumber()
    periodBalance: number;
}

/** One account "card" (כרטיס) — all its movements plus totals. */
export class LedgerAccountDto {
    @IsString()
    accountCode: string;

    /** From DefaultBookingAccount.name; '' if the code has no chart entry. */
    @IsString()
    accountName: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LedgerLineDto)
    lines: LedgerLineDto[];

    @IsNumber()
    totalDebit: number;

    @IsNumber()
    totalCredit: number;

    /** sum(credit - debit) for this account (within-period movement only). */
    @IsNumber()
    closingBalance: number;

    /** יתרת פתיחה — signed balance of all lines BEFORE the requested period. */
    @IsNumber()
    openingBalance: number;

    /** מספר תנועות — number of journal lines in this account card. */
    @IsNumber()
    lineCount: number;
}

export class LedgerReportDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LedgerAccountDto)
    accounts: LedgerAccountDto[];
}
