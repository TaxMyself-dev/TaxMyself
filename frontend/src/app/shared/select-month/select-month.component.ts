import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ReportingPeriodType } from '../enums';

@Component({
    selector: 'app-select-month',
    templateUrl: './select-month.component.html',
    styleUrls: ['./select-month.component.scss', '../shared-styling.scss'],
    standalone: false
})
export class SelectMonthComponent {
  @Input() oneMonth: boolean = false;
  @Input() year: string;
  @Input() parentForm: FormGroup;
  @Input() controlName: string = 'month';


  selectedMonth: string = '';

  doubleMonths = [
    { value: '1', name: 'ינואר - פברואר' },
    { value: '3', name: 'מרץ - אפריל' },
    { value: '5', name: 'מאי - יוני' },
    { value: '7', name: 'יולי - אוגוסט' },
    { value: '9', name: 'ספטמבר - אוקטובר' },
    { value: '11', name: 'נובמבר - דצמבר' }
  ];

  singleMonths = [
    { value: '1', name: 'ינואר' },
    { value: '2', name: 'פברואר' },
    { value: '3', name: 'מרץ' },
    { value: '4', name: 'אפריל' },
    { value: '5', name: 'מאי' },
    { value: '6', name: 'יוני' },
    { value: '7', name: 'יולי' },
    { value: '8', name: 'אוגוסט' },
    { value: '9', name: 'ספטמבר' },
    { value: '10', name: 'אוקטובר' },
    { value: '11', name: 'נובמבר' },
    { value: '12', name: 'דצמבר' }
  ];

  constructor() {
    const now = new Date();
  const currentYear = now.getFullYear();
  console.log("currentYear: ", currentYear);
  
   }

  get month(): ({value: string | number; name: string | number;})[] {
    if (this.parentForm?.get('reportingPeriodType')?.value === ReportingPeriodType.MONTHLY) {
      // return this.singleMonths;
      return this.getValidSingleMonths();
    }
    else return this.getValidDoubleMonths();
    // else return this.doubleMonths;
  }

  getValidSingleMonths() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-based (January = 1)
  
    // If the selected year is before the current year, return ALL months
    if (+this.year < currentYear) {
      return this.singleMonths;
    }
    
    // If the selected year is after the current year, return an empty array
    if (+this.year > currentYear) {
      return [];
    }
    
    // If the selected year IS the current year, allow months up to (and including) the current month
    return this.singleMonths.filter((m) => {
      const monthValue = parseInt(m.value, 10);
      return monthValue <= currentMonth;
    });
  }

  getValidDoubleMonths() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
  
    // If the selected year is before the current year, return all double-months
    if (+this.year < currentYear) {
      return this.doubleMonths;
    }
  
    // If the selected year is after the current year, return empty (or all, if you prefer)
    if (+this.year > currentYear) {
      return [];
    }
  
    // If it's the current year, we need to see if the end of each 2-month range has passed.
    return this.doubleMonths.filter((dm) => {
      const start = parseInt(dm.value, 10);
      const end = start + 1; // e.g. if start = 1, end = 2
      // This double-month is valid if we've reached or passed its end month
      return end <= currentMonth;
    });
  }
  
  
}

