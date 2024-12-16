import { Component, EventEmitter, Input, Output} from '@angular/core';
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
  @Input() title: string;
  @Output() onSelectionChange: EventEmitter<void> = new EventEmitter<void>();


  selectedMonth: string = '';

  constructor() { }

  onSelect(event: any): void {
    console.log("event in period type: ",event);
    
    this.onSelectionChange.emit(event)
  }

}

