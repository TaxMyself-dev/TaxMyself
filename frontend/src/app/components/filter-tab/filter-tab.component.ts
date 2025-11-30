import { Component, input, output, inject, Signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FilterField } from './filter-fields-model.component';
import { InputSelectComponent } from '../input-select/input-select.component';
import { PeriodSelectComponent } from '../period-select/period-select.component';
import { ButtonComponent } from '../button/button.component';
import { ISelectItem } from 'src/app/shared/interface';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { inputsSize } from 'src/app/shared/enums';

@Component({
  selector: 'app-filter-tab',
  standalone: true,
  templateUrl: './filter-tab.component.html',
  styleUrls: ['./filter-tab.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputSelectComponent,
    PeriodSelectComponent,
    ButtonComponent,
  ]
})
export class FilterTabComponent {

  private fb = inject(FormBuilder);

  buttonSize = ButtonSize;
  inputSize = inputsSize
  buttonColor = ButtonColor;
  
  // The filter field configuration
  config = input<FilterField[]>([]);

  // Parent form
  parentForm = input.required<FormGroup>();

  // Emits the final form result
  apply = output<any>();
    


  ngOnInit() {
    this.buildForm();
  }


  /** Build dynamic form structure */
  private buildForm(): void {
    const form = this.parentForm();

    for (const field of this.config()) {

      // period controls building in period select component
      if (field.type === 'period') {
        continue;
      }
      form.addControl(field.controlName, new FormControl(
        field.defaultValue ?? '',
        field.required ? Validators.required : []
      ));
    }
  }

  /** Emit form data when user clicks Apply */
  onApply() {
    console.log(this.parentForm());
    this.apply.emit(this.parentForm()?.value);
  }

  /** Resolve select dropdown items (supports arrays and signals) */
  resolveOptions(field: FilterField): ISelectItem[] {
    if (!field.options) return [];

    return typeof field.options === 'function'
      ? (field.options as Signal<ISelectItem[]>)()
      : field.options;
  }
}