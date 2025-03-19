import { ISelectItem } from '../interface';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
    selector: 'app-generic-select',
    templateUrl: './generic-select.component.html',
    styleUrls: ['./generic-select.component.scss', '../shared-styling.scss'],
    standalone: false
})

export class GenericSelectComponent implements OnChanges{  
  @Input() items: ISelectItem[];
  @Input() parentForm: FormGroup;
  @Input() errorText: string;
  @Input() className: string;
  @Input() controlName: string;
  //@Input() addOther: boolean = false;
  @Input() set title (val: string) {
    this.inputLabelName = val;
  }
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

  @Output() selectionChanged = new EventEmitter<number>();

  RequiredErrorMessage = "שדה זה הוא חובה";
  errorMessage: string;
  inputLabelName: string;

  get showErrorMessage(): boolean {
    return this.currentFormControl() ? this.currentFormControl().touched && this.currentFormControl().invalid : false;
  }

  constructor() {}

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
    console.log("event is ", event);
       
    this.selectionChanged.emit(event.detail);
  }

  currentFormControl(): FormControl {
    return (this.parentForm && this.controlName) ? this.parentForm.get(this.controlName) as FormControl: null;
  }

  isRequired(): boolean {
    return !!this.currentFormControl()?.hasValidator(Validators.required);
  }
}
