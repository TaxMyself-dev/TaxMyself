import { Component, Input} from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-select-month-format',
  templateUrl: './select-month-format.component.html',
  styleUrls: ['./select-month-format.component.scss','../search-bar/search-bar.component.scss']
})
export class SelectMonthFormatComponent {
  @Input() oneMonth: boolean = false;
  @Input() parentForm: FormGroup;

  selectedMonth: string = '';

  optionsTypes = [{value: 'oneMonth', name: 'חודשי'}, {value: 'twoMonth', name: 'דו-חודשי'}];

  constructor() { }
}

