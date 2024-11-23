import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ReportingPeriodType } from '../enums';

@Component({
  selector: 'app-select-month',
  templateUrl: './select-month.component.html',
  styleUrls: ['./select-month.component.scss','../shared-styling.scss']
})
export class SelectMonthComponent {
  @Input() oneMonth: boolean = false;
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

  constructor() { }

  get month(): ({value: string | number; name: string | number;})[] {
    if (this.parentForm?.get('reportingPeriodType')?.value === ReportingPeriodType.MONTHLY) {
      return this.singleMonths;
    }
    else return this.doubleMonths;
  }

}

