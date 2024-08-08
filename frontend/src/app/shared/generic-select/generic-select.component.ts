import { Component, EventEmitter, Input, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-generic-select',
  templateUrl: './generic-select.component.html',
  styleUrls: ['./generic-select.component.scss', '../shared-styling.scss'],
})
export class GenericSelectComponent {  
  @Input() items: ({value: string | number | boolean; name: string | number;})[];
  @Input() parentForm: FormGroup;
  @Input() errorText: string;
  @Input() controlName: string;
  @Input() set title (val: string) {
    this.inputLabelName = val;
  }

  @Output() selectionChanged = new EventEmitter<number>();

  RequiredErrorMessage = "שדה זה הוא חובה";
  errorMessage: string;
  inputLabelName: string;

  get showErrorMessage(): boolean {
    return this.currentFormControl() ? this.currentFormControl().touched && this.currentFormControl().invalid : false;
  }

  constructor() { }

  ngOnChanges(changes: SimpleChanges): void {
    const isRequired = this.isRequired();
    if (changes.errorText || changes.controlName) {
      this.errorMessage = isRequired ? this.errorText ?? this.RequiredErrorMessage : this.errorText;
    }
    if (changes.title || changes.controlName) {
      this.inputLabelName = isRequired ? this.inputLabelName + ' *' : this.inputLabelName;
    }
  }


  onSelectChange(event: any): void {    
    this.selectionChanged.emit(event.detail);
  }

  currentFormControl(): FormControl {
    return (this.parentForm && this.controlName) ? this.parentForm.get(this.controlName) as FormControl: null;
  }

  isRequired(): boolean {
    return !!this.currentFormControl()?.hasValidator(Validators.required);
  }
}
