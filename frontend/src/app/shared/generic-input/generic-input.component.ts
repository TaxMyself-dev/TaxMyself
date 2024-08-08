import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-generic-input',
  templateUrl: './generic-input.component.html',
  styleUrls: ['./generic-input.component.scss', '../shared-styling.scss'],
})
export class GenericInputComponent implements OnChanges {

  @Input() parentForm: FormGroup;
  @Input() controlName: string;
  @Input() errorText: string;
  @Input() set inputLabel(val: string) {
    this.inputLabelName = val;
}

  RequiredErrorMessage = "שדה זה הוא חובה";
  errorMessage: string;
  inputLabelName: string;

  constructor() { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.errorText || changes.controlName) {
      this.errorMessage = this.isRequired() ? this.errorText ?? this.RequiredErrorMessage : this.errorText;
    }
    if (changes.inputLabel || changes.controlName) {
      this.inputLabelName = this.isRequired() ? this.inputLabelName + ' *' : this.inputLabelName;
    }
  }

  currentFormControl(): FormControl {
    return this.parentForm && this.controlName ? this.parentForm.get(this.controlName) as FormControl: null;
  }

  isRequired(): boolean {
    return !!this.currentFormControl()?.hasValidator(Validators.required);
  }

}
