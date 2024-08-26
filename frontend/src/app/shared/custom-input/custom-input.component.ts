import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DateService } from 'src/app/services/date.service';
import { ButtonClass, ButtonSize } from '../button/button.enum';

@Component({
  selector: 'app-custom-input',
  templateUrl: './custom-input.component.html',
  styleUrls: ['./custom-input.component.scss', '../shared-styling.scss', '../generic-input/generic-input.component.scss'],
})
export class CustomInputComponent implements OnChanges {

  @Input() parentForm: FormGroup;
  @Input() controlName: string;
  @Input() errorText: string;
  @Input() inputType = "text";
  @Input() showError = false;  // for non form inputs
  @Input() required = false; // for non form inputs
  @Input() set inputLabel(val: string) {
    this.inputLabelName = val;
  }

  @Output() onInputChange: EventEmitter<string> = new EventEmitter<string>();  // for non form inputs

  readonly ButtonClass = ButtonClass;
  readonly ButtonSize = ButtonSize;
  
  RequiredErrorMessage = "שדה זה הוא חובה";
  errorMessage: string;
  inputLabelName: string;
  showPassword = false;
  isFocused = false;
  isValid = false;
  isInvalid = false;

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {
    const isRequired = this.isRequired() || this.required;

    if (changes.errorText || changes.controlName) {
      this.errorMessage = isRequired ? this.errorText ?? this.RequiredErrorMessage : this.errorText;
    }
    if (changes.inputLabel || changes.controlName) {
      if (changes.inputLabel.currentValue?.slice(-1) !== "*") {
        this.inputLabelName = isRequired ? this.inputLabelName + ' *' : this.inputLabelName;
      }
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
    this.onInputKeyChange();
    this.onInputChange.emit(event?.detail?.value);
  }

  onInputKeyChange(): void {
    this.isValid = !!this.currentFormControl()?.valid;
    this.isInvalid = !this.isValid;
  }

  onFocus(): void {
    this.isFocused = true;
  }

  onBlur(): void {
    this.isFocused = false;
    this.isValid = !!this.currentFormControl()?.valid;
    this.isInvalid = !this.isValid;
  }
}

