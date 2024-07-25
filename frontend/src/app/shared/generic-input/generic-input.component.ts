import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-generic-input',
  templateUrl: './generic-input.component.html',
  styleUrls: ['./generic-input.component.scss', '../shared-styling.scss'],
})
export class GenericInputComponent implements OnChanges {

  @Input() parentForm: FormGroup;
  @Input() controlName: string;
  @Input() inputLabel: string;
  @Input() errorText: string;
  @Input() isRequired = false;

  RequiredErrorMessage = "שדה זה הוא חובה";
  errorMessage: string;

  constructor() { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.errorText || changes.isRequired) {
      this.errorMessage = this.isRequired ? this.errorText ?? this.RequiredErrorMessage : this.errorText;
    }
  }

}
