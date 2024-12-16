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

    let start: Date;
    let end: Date;

    switch (periodType) {
      case ReportingPeriodType.MONTHLY:
        start = startOfMonth(new Date(year, month - 1));
        end = endOfMonth(new Date(year, month - 1));
        break;

      case ReportingPeriodType.BIMONTHLY:
        start = startOfMonth(new Date(year, month - 1));
        end = endOfMonth(addMonths(new Date(year, month - 1), 1));
        break;

      case ReportingPeriodType.ANNUAL:
        start = startOfYear(new Date(year, 0));
        end = endOfYear(new Date(year, 0));
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