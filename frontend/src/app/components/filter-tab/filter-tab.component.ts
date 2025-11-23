import {
  Component,
  input,
  output,
  inject,
  Signal,
  model
} from '@angular/core';

import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';

import { CommonModule } from '@angular/common';
import { FilterField } from './filter-fields-model.component';

import { InputSelectComponent } from '../input-select/input-select.component';
import { InputDateComponent } from '../input-date/input-date.component';
import { PeriodSelectComponent } from '../period-select/period-select.component';
import { ButtonComponent } from '../button/button.component';

import { ISelectItem } from 'src/app/shared/interface';
import { ButtonColor, ButtonSize } from '../button/button.enum';

@Component({
  selector: 'app-filter-tab',
  standalone: true,
  templateUrl: './filter-tab.component.html',
  styleUrls: ['./filter-tab.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputSelectComponent,
    InputDateComponent,
    PeriodSelectComponent,
    ButtonComponent,
  ]
})
export class FilterTabComponent {

  // The filter field configuration
  config = input<FilterField[]>([]);

  // Parent can pass a form — OR we create internally
  form = model<FormGroup | null>(null);

  // Emits the final form result
  apply = output<any>();

  private fb = inject(FormBuilder);

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  ngOnInit() {
    // Parent did NOT pass a form → build internal
    if (!this.form()) {
      this.form.set(this.buildForm());
    }
  }

  /** Build dynamic form structure */
  private buildForm(): FormGroup {
    const group: Record<string, any> = {};

    for (const field of this.config()) {

      // Special case: PERIOD FIELD = nested FormGroup
      if (field.type === 'period') {
        group[field.controlName] = this.fb.group({
          periodMode: [null, Validators.required],
          year: [null],
          month: [null],
          startDate: [null],
          endDate: [null]
        });
        continue;
      }

      // Regular fields
      group[field.controlName] = [
        field.defaultValue ?? null,
        field.required ? Validators.required : []
      ];
    }

    return this.fb.group(group);
  }

  /** Emit form data when user clicks Apply */
  onApply() {
    this.apply.emit(this.form()!.value);
  }

  /** Resolve select dropdown items (supports arrays and signals) */
  resolveOptions(field: FilterField): ISelectItem[] {
    if (!field.options) return [];

    return typeof field.options === 'function'
      ? (field.options as Signal<ISelectItem[]>)()
      : field.options;
  }
}