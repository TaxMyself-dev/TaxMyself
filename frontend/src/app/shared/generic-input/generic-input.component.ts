import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DateService } from 'src/app/services/date.service';
import { ButtonClass, ButtonSize } from '../button/button.enum';

@Component({
  selector: 'app-generic-input',
  templateUrl: './generic-input.component.html',
  styleUrls: ['./generic-input.component.scss', '../shared-styling.scss'],
})
export class GenericInputComponent implements OnChanges {

  @Input() parentForm: FormGroup;
  @Input() controlName: string;
  @Input() errorText: string;
  @Input() className: string;
  @Input() inputType = "text";
  @Input() minDate: string;
  @Input() showError = false;  // for non form inputs
  @Input() required = false; // for non form inputs
  @Input() set customMaxDate(val: string) {
    this.maxDate = val;
  }
  @Input() set inputLabel(val: string) {
    this.inputLabelName = val;
  }

  @Output() onInputChange: EventEmitter<string> = new EventEmitter<string>();  // for non form inputs

  @Input() set disabled(val: boolean) {
    const currentFormControl = this.currentFormControl();
    if (currentFormControl) {
      if (val) {
        currentFormControl.disable();
      } else {
        currentFormControl.enable();
      }
    }
  }

  readonly ButtonClass = ButtonClass;
  readonly ButtonSize = ButtonSize;
  
  RequiredErrorMessage = "שדה זה הוא חובה";
  errorMessage: string;
  inputLabelName: string;
  maxDate: string;
  showPassword = false;

  constructor(private dateService: DateService) {
    this.maxDate = this.dateService.getTodaysDate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const isRequired = this.isRequired() || this.required;

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

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onInputChanged(event): void {
    this.onInputChange.emit(event?.detail?.value);
  }
}
