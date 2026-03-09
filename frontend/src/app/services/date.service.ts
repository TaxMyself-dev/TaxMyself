import { Injectable } from '@angular/core';
import { ReportingPeriodType } from '../shared/enums';
import { format, startOfMonth, endOfMonth, addMonths, startOfYear, endOfYear } from 'date-fns';


@Injectable({
  providedIn: 'root'
})
export class DateService {

  constructor() { }

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
        start = new Date(startDate);
        end = new Date(endDate);
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