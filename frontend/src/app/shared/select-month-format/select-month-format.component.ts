import { Component, Input} from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-select-month-format',
  templateUrl: './select-month-format.component.html',
  styleUrls: ['./select-month-format.component.scss']
})
export class SelectMonthFormatComponent {
  @Input() oneMonth: boolean = false;
  @Input() parentForm: FormGroup;

  selectedMonth: string = '';

  optionsTypes = [{value: true, name: 'חודשי'}, {value: false, name: 'דו-חודשי'}];

  constructor() { }
}

