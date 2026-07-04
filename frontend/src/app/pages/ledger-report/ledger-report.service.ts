import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';

/** One movement row within an account card. */
export interface ILedgerLine {
  entryNumber: number;        // מספר פקודה
  date: string;               // תאריך יצירה
  valueDate: string;          // תאריך ערך
  vatDate: string;            // תאריך למע"מ
  vatReportingPeriod: string; // תקופת דיווח
  allocationNum: string;      // מספר הקצאה (tax authority)
  notes: string;              // הערות
  referenceType: string;      // סוג מסמך
  referenceId: number;        // אסמכתא
  journalEntryId: number;     // מפתח פנימי לשליפת הפקודה המלאה
  description: string;        // פרטים
  counterAccounts: string | null; // ח. נגדי
  counterPartyName: string | null; // ספק/לקוח
  subCategoryName: string | null; // תת קטגוריה
  movementType: string;       // סוג מסמך (Hebrew label)
  debit: number;              // חובה
  credit: number;             // זכות
  totalAmount: number;        // סה"כ בש"ח
  currency: string;           // מטבע
  exchangeRate: number;       // שע"ח
  amountBeforeVat: number;    // סכום לרוה"ס
  amountForTax: number;       // סה"כ לרווח והפסד
  vatAmount: number;          // סכום למע"מ
  taxPercent: number;         // % מוכר למס
  vatPercent: number;         // % מוכר למע"מ
  documentTotal: number | null; // סה"כ מסמך
  balance: number;            // יתרה
  periodBalance: number;      // יתרה לתקופה
}

/** One account "card" (כרטיס) with its movements + totals. */
export interface ILedgerAccount {
  accountCode: string;
  accountName: string;
  lines: ILedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  openingBalance: number;
  lineCount: number;
}

export interface ILedgerReport {
  accounts: ILedgerAccount[];
}

/** שורה אחת בפקודת יומן מלאה (לתצוגה בחלון). */
export interface IJournalEntryLineDetail {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

/** פקודת יומן מלאה — כל השורות עם מטא-נתוני הכותרת. */
export interface IJournalEntryDetail {
  entryNumber: number;
  date: string;
  valueDate: string;
  vatDate: string;
  referenceId: number;
  referenceType: string;
  description: string;
  counterPartyName: string | null;
  lines: IJournalEntryLineDetail[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

/** Chart-of-accounts row for the filter dropdown. */
export interface ILedgerAccountOption {
  code: string;
  name: string;
  type: string;
}

@Injectable({
  providedIn: 'root'
})
export class LedgerReportService {

  constructor(private http: HttpClient) {}

  getLedgerReportData(
    startDate: string,
    endDate: string,
    businessNumber: string,
    accountCode?: string | null,
  ): Observable<ILedgerReport> {
    const url = `${environment.apiUrl}reports/ledger-report`;
    let params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('businessNumber', businessNumber);
    if (accountCode) {
      params = params.set('accountCode', accountCode);
    }
    return this.http.get<ILedgerReport>(url, { params });
  }

  /** Full chart of accounts for the ledger FILTER dropdown (incl. technical accounts). */
  getLedgerAccounts(): Observable<ILedgerAccountOption[]> {
    const url = `${environment.apiUrl}reports/ledger-accounts`;
    return this.http.get<ILedgerAccountOption[]>(url);
  }

  /** Posting accounts for the MANUAL JOURNAL ENTRY dropdown (excludes technical accounts). */
  getLedgerEntryAccounts(): Observable<ILedgerAccountOption[]> {
    const url = `${environment.apiUrl}reports/ledger-entry-accounts`;
    return this.http.get<ILedgerAccountOption[]>(url);
  }

  /** Fetch all lines of a journal entry for the detail modal. */
  getJournalEntryDetail(
    businessNumber: string,
    entryId: number,
  ): Observable<IJournalEntryDetail> {
    const url = `${environment.apiUrl}reports/journal-entry/${entryId}`;
    const params = new HttpParams().set('businessNumber', businessNumber);
    return this.http.get<IJournalEntryDetail>(url, { params });
  }

}
