import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-select-month',
  templateUrl: './select-month.component.html',
  styleUrls: ['./select-month.component.scss']
})
export class SelectMonthComponent {
  @Input() oneMonth: boolean = false;
  @Input() parentForm: FormGroup;

  selectedMonth: string = '';

  doubleMonths = [
    { value: '01-02', name: 'ינואר - פברואר' },
    { value: '03-04', name: 'מרץ - אפריל' },
    { value: '05-06', name: 'מאי - יוני' },
    { value: '07-08', name: 'יולי - אוגוסט' },
    { value: '09-10', name: 'ספטמבר - אוקטובר' },
    { value: '11-12', name: 'נובמבר - דצמבר' }
  ];

  singleMonths = [
    { value: '01', name: 'ינואר' },
    { value: '02', name: 'פברואר' },
    { value: '03', name: 'מרץ' },
    { value: '04', name: 'אפריל' },
    { value: '05', name: 'מאי' },
    { value: '06', name: 'יוני' },
    { value: '07', name: 'יולי' },
    { value: '08', name: 'אוגוסט' },
    { value: '09', name: 'ספטמבר' },
    { value: '10', name: 'אוקטובר' },
    { value: '11', name: 'נובמבר' },
    { value: '12', name: 'דצמבר' }
  ];

  constructor() { }

  get month(): ({value: string | number; name: string | number;})[] {
    return this.parentForm?.get('monthFormat')?.value === 'oneMonth' ? this.singleMonths : this.doubleMonths;
  } 
}

