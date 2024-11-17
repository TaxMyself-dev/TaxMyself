import { Component, Input} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ISelectItem } from '../interface';
import { reportingPeriodTypeOptionsList } from '../enums';

@Component({
  selector: 'app-select-report-period',
  templateUrl: './select-report-period.component.html',
  styleUrls: ['./select-report-period.component.scss']
})
export class SelectMonthFormatComponent {
  @Input() oneMonth: boolean = false;
  @Input() parentForm: FormGroup;
  @Input() optionsTypes: ISelectItem[] = reportingPeriodTypeOptionsList;

  selectedMonth: string = '';

  constructor() { }
}

