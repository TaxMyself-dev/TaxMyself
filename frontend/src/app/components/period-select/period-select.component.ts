import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  input
} from '@angular/core';

import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';

import {
  ReportingPeriodType,
  doubleMonthsList,
  singleMonthsList
} from 'src/app/shared/enums';

import { InputSelectComponent } from '../input-select/input-select.component';
import { InputDateComponent } from '../input-date/input-date.component';
import { ButtonComponent } from '../button/button.component';
import { ISelectItem } from 'src/app/shared/interface';
import { ButtonSize, ButtonColor } from '../button/button.enum';

@Component({
  selector: 'app-period-select',
  standalone: true,
  templateUrl: './period-select.component.html',
  styleUrls: ['./period-select.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputSelectComponent,
    InputDateComponent,
    ButtonComponent
  ]
})
export class PeriodSelectComponent {

  /** Parent form → embedded mode */
  parentForm = input<FormGroup | null>(null);

  /** Control name inside parent form in embedded mode */
  controlName = input<string>('');

  /** Event for standalone mode */
  @Output() formSubmit = new EventEmitter<any>();

  private fb = inject(FormBuilder);

  /** Internal form for standalone mode */
  private internalForm = this.fb.group({
    periodMode: [null, Validators.required],
    year: [null],
    month: [null],
    startDate: [null],
    endDate: [null]
  });

  /** UI enums for button */
  ButtonColor = ButtonColor;
  ButtonSize = ButtonSize;

  /** If true → embedded inside filter component */
  get isEmbedded(): boolean {
    return !!this.parentForm();
  }

  /** Returns correct active FormGroup */
  get form(): FormGroup {
    return this.isEmbedded
      ? (this.parentForm()!.get(this.controlName()) as FormGroup)
      : this.internalForm;
  }

  ngOnInit() {
    if (this.isEmbedded) {
      // Parent form must have nested group "period"
      if (!this.parentForm()!.get(this.controlName())) {
        this.parentForm()!.addControl(
          this.controlName(),
          this.internalForm
        );
      }
    }
  }

  /* ---------------------------
     Logic used by the template
  ----------------------------*/
  getPeriodModeOptions(): ISelectItem[] {
    return [
      { name: 'חודשי', value: ReportingPeriodType.MONTHLY },
      { name: 'דו-חודשי', value: ReportingPeriodType.BIMONTHLY },
      { name: 'שנתי', value: ReportingPeriodType.ANNUAL },
      { name: 'טווח תאריכים', value: ReportingPeriodType.DATE_RANGE },
    ];
  }

  generateYears(): ISelectItem[] {
    const current = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => ({
      name: current - i,
      value: current - i,
    }));
  }

  get monthList(): ISelectItem[] {
    const mode = this.form.get('periodMode')?.value;
    return mode === ReportingPeriodType.BIMONTHLY
      ? doubleMonthsList
      : singleMonthsList;
  }

  onSubmitStandalone() {
    if (!this.isEmbedded) {
      this.formSubmit.emit(this.internalForm.value);
    }
  }
}
