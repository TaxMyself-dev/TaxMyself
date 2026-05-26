import { Injectable } from '@angular/core';
import { ReportingPeriodType } from '../shared/enums';
import { format, startOfMonth, endOfMonth, addMonths, startOfYear, endOfYear } from 'date-fns';


@Injectable({
  providedIn: 'root'
})
export class DateService {

  constructor() { }

  /**
   * Parse flexible date strings coming from UI (e.g. p-datepicker with dd-mm-yy format).
   * We intentionally parse common dd-MM-yyyy / dd/MM/yyyy / yyyy-MM-dd manually because `new Date("01-03-2026")`
   * is implementation-dependent and often invalid.
   */
  private parseUiDate(val: unknown): Date | null {
    if (val == null) return null;

    if (val instanceof Date) {
      return Number.isNaN(val.getTime()) ? null : val;
    }

    if (typeof val === 'number') {
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const s = String(val).trim();
    if (!s) return null;

    // ISO: yyyy-MM-dd
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      const parsed = new Date(y, mo - 1, d);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    // Local: dd-MM-yyyy or dd/MM/yyyy
    m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = Number(m[3]);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    // Local: dd-MM-yy or dd/MM/yy
    m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{2})$/);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]);
      const yearRaw = Number(m[3]);
      const year = yearRaw <= 49 ? 2000 + yearRaw : 1900 + yearRaw;
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    // Fallback: native parsing
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  getTodaysDate(): string {
    const currentDate = new Date();
    return currentDate.toISOString().substring(0, 10);
  }


  convertStringToDate(date: number): Date {    
    return new Date(date);
  }


  formatDate(date: Date): string {
    return format(date, 'dd/MM/yyyy');
  }

  
  getStartAndEndDates(periodType: ReportingPeriodType, year: number, month: number, startDate: string, endDate: string): { startDate: string, endDate: string } {

    const y = Number(year);
    let m = Number(month);
    if (Number.isNaN(m)) m = 1;

    // דו-חודשי: הערך צריך להיות חודש ראשון בתקופה (1,3,5,7,9,11). אם הגיע חודש זוגי – מנרמל.
    if (periodType === ReportingPeriodType.BIMONTHLY && m >= 1 && m <= 12) {
      if (m <= 2) m = 1;
      else if (m <= 4) m = 3;
      else if (m <= 6) m = 5;
      else if (m <= 8) m = 7;
      else if (m <= 10) m = 9;
      else m = 11;
    }

    let start: Date;
    let end: Date;

    switch (periodType) {
      case ReportingPeriodType.MONTHLY:
        start = startOfMonth(new Date(y, m - 1));
        end = endOfMonth(new Date(y, m - 1));
        break;

      case ReportingPeriodType.BIMONTHLY:
        start = startOfMonth(new Date(y, m - 1));
        end = endOfMonth(addMonths(new Date(y, m - 1), 1));
        break;

      case ReportingPeriodType.ANNUAL:
        start = startOfYear(new Date(y, 0));
        end = endOfYear(new Date(y, 0));
        break;

      case ReportingPeriodType.DATE_RANGE:
        start = this.parseUiDate(startDate) as Date;
        end = this.parseUiDate(endDate) as Date;
        if (!start || !end) {
          throw new Error('תאריכים לא תקינים - נא לבחור תאריכים בפורמט תקני');
        }
        break;

      default:
        throw new Error('Invalid period type');
    }

    return {
      startDate: this.formatDate(start),
      endDate: this.formatDate(end)
    };
  }

  
}