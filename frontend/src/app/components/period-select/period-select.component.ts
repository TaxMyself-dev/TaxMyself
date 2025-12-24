import {
  Component,
  input,
  inject
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
  inputsSize,
  singleMonthsList
} from 'src/app/shared/enums';
import { PeriodDefaults } from '../filter-tab/filter-fields-model.component';

import { InputSelectComponent } from '../input-select/input-select.component';
import { InputDateComponent } from '../input-date/input-date.component';
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
  ]
})
export class PeriodSelectComponent {

  /** Parent form - component always receives form from parent */
  parentForm = input.required<FormGroup>();

  /** Allowed period modes to display */
  allowedPeriodModes = input<ReportingPeriodType[]>([
    ReportingPeriodType.MONTHLY,
    ReportingPeriodType.BIMONTHLY,
    ReportingPeriodType.ANNUAL,
    ReportingPeriodType.DATE_RANGE
  ]);

  /** Default values for period fields */
  periodDefaults = input<PeriodDefaults>();

  private fb = inject(FormBuilder);

  ButtonColor = ButtonColor;
  ButtonSize = ButtonSize;
  inputSize = inputsSize

  get form(): FormGroup {
    return this.parentForm();
  }

  ngOnInit() {
    console.log("this.parentForm()", this.parentForm());
    const form = this.parentForm();
    const defaults = this.periodDefaults();
    
    // Add only periodMode control initially with default value
    if (!form?.get('periodMode')) {
      console.log("periodMode control not found");
      const defaultPeriodMode = defaults?.periodMode || null;
      form.addControl('periodMode', this.fb.control(defaultPeriodMode, Validators.required));
      
      // If default periodMode exists, initialize the corresponding controls
      if (defaultPeriodMode) {
        this.updateFormControls(defaultPeriodMode);
      }
    }

    // Listen to periodMode changes and add/remove controls dynamically
    form.get('periodMode')?.valueChanges.subscribe((mode: ReportingPeriodType) => {
      this.updateFormControls(mode);
    });
  }

  private updateFormControls(mode: ReportingPeriodType) {
    console.log("this.parentForm()", this.parentForm());
    const form = this.parentForm();
    const defaults = this.periodDefaults();

    // Remove all period-related controls first
    ['year', 'month', 'startDate', 'endDate'].forEach(controlName => {
      if (form.get(controlName)) {
        form.removeControl(controlName);
      }
    });

    // Add controls based on selected mode with default values
    if (mode === ReportingPeriodType.MONTHLY || mode === ReportingPeriodType.BIMONTHLY) {
      form.addControl('year', this.fb.control(defaults?.year || null, Validators.required));
      form.addControl('month', this.fb.control(defaults?.month || null, Validators.required));
    } else if (mode === ReportingPeriodType.ANNUAL) {
      form.addControl('year', this.fb.control(defaults?.year || null, Validators.required));
    } else if (mode === ReportingPeriodType.DATE_RANGE) {
      form.addControl('startDate', this.fb.control(defaults?.startDate || null, Validators.required));
      form.addControl('endDate', this.fb.control(defaults?.endDate || null, Validators.required));
    }
  }

  getPeriodModeOptions(): ISelectItem[] {
    const allOptions = [
      { name: 'חודשי', value: ReportingPeriodType.MONTHLY },
      { name: 'דו-חודשי', value: ReportingPeriodType.BIMONTHLY },
      { name: 'שנתי', value: ReportingPeriodType.ANNUAL },
      { name: 'טווח תאריכים', value: ReportingPeriodType.DATE_RANGE },
    ];
    
    // Filter by allowed period modes
    return allOptions.filter(option => 
      this.allowedPeriodModes()?.includes(option.value)
    );
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
}
