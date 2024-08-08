import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DateService } from 'src/app/services/date.service';

@Component({
  selector: 'app-generic-input',
  templateUrl: './generic-input.component.html',
  styleUrls: ['./generic-input.component.scss', '../shared-styling.scss'],
})
export class GenericInputComponent implements OnChanges {

  @Input() parentForm: FormGroup;
  @Input() controlName: string;
  @Input() errorText: string;
  @Input() inputType = "text";
  @Input() minDate: string;
  @Input() set customMaxDate(val: string) {
    this.maxDate = val;
  }
  @Input() set inputLabel(val: string) {
    this.inputLabelName = val;
}

  RequiredErrorMessage = "שדה זה הוא חובה";
  errorMessage: string;
  inputLabelName: string;
  maxDate: string;

  constructor(private dateService: DateService) {
    this.maxDate = this.dateService.getTodaysDate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const isRequired = this.isRequired();

    if (changes.errorText || changes.controlName) {
      this.errorMessage = isRequired ? this.errorText ?? this.RequiredErrorMessage : this.errorText;
    }
    if (changes.inputLabel || changes.controlName) {
      this.inputLabelName = isRequired ? this.inputLabelName + ' *' : this.inputLabelName;
    }
  }

  currentFormControl(): FormControl {
    return (this.parentForm && this.controlName) ? this.parentForm?.get(this.controlName) as FormControl: null;
  }

  isRequired(): boolean {
    return !!this.currentFormControl()?.hasValidator(Validators.required);
  }

}
