import { JournalReferenceType } from "src/enum";

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  amountBeforeVat?: number;   // סכום לרוה"ס
  vatAmount?: number;         // סכום למע"מ
  isEquipment?: boolean;      // mirrors source expense.isEquipment (false for documents)
  taxPercent?: number;        // אחוז מוכר למס הכנסה (0-100); defaults to 100
  vatPercent?: number;        // אחוז מוכר למע"מ (0-100); defaults to 100
  amountForTax?: number;      // סכום מוכר למס = debit × (taxPercent/100)
  subCategoryName?: string | null; // sub-category name for expense lines; null for VAT/income lines
}

export interface JournalEntryInput {
  firebaseId: string;            // Firebase UID of the business owner — scopes all journal queries
  issuerBusinessNumber: string;
  subCategory?: string | null;   // sub-category name from the source expense; null for income docs
  counterAccountCode?: string | null; // single counter-account for the entry header (e.g. '2000', '1100', '1200')
  counterPartyName?: string | null;   // שם ספק / לקוח
  documentTotal?: number | null;      // סה"כ מסמך כולל מע"מ
  date: string;
  valueDate?: string;         // תאריך ערך
  vatDate?: string;           // תאריך למע"מ
  notes?: string;             // הערות
  vatReportingPeriod?: string | null; // VAT/income period label ("3/2026", "1-2/2026", "2026")
  referenceType?: JournalReferenceType;
  referenceId?: number;
  description?: string;
  lines: JournalLineInput[];
}
