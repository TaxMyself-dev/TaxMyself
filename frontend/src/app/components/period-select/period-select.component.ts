import {
  Component,
  computed,
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

  /** Size class forwarded from the parent (e.g. 'mobile', 'normal'). Defaults to MEDIUM. */
  size = input<string>('');

  private fb = inject(FormBuilder);

  ButtonColor = ButtonColor;
  ButtonSize = ButtonSize;
  inputSize = inputsSize;

  readonly effectiveSize = computed(() => this.size() || this.inputSize.MEDIUM);

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

  /** לדו-חודשי הרשימה היא רק 1,3,5,7,9,11 – ממירים חודש נוכחי לתקופה דו-חודשית תקינה */
  private getDefaultMonthForMode(mode: ReportingPeriodType, defaultMonth: string | number | undefined): string | null {
    const num = defaultMonth != null ? Number(defaultMonth) : new Date().getMonth() + 1;
    if (mode === ReportingPeriodType.BIMONTHLY) {
      if (num <= 2) return '1';
      if (num <= 4) return '3';
      if (num <= 6) return '5';
      if (num <= 8) return '7';
      if (num <= 10) return '9';
      return '11';
    }
    return defaultMonth != null ? String(defaultMonth) : null;
  }

  private updateFormControls(mode: ReportingPeriodType) {
    const form = this.parentForm();
    const defaults = this.periodDefaults();

    // CRITICAL: do NOT removeControl + addControl on a control that both the
    // old and new mode need (e.g. 'month' across MONTHLY ↔ BIMONTHLY). The
    // <p-select formControlName="month"> directive inside <app-input-select>
    // binds to the FormControl *instance* at template-render time; when we
    // remove and re-add a control with the same name, the directive keeps
    // pointing at the orphaned instance, so the user's next click writes the
    // value into a control that's no longer in the form. The form keeps
    // whatever default we put on the new instance, the submit reads the wrong
    // value, and the period gets pulled for the wrong months.
    // Mutate in place via setValue when the control already exists.
    const needsYearMonth = mode === ReportingPeriodType.MONTHLY || mode === ReportingPeriodType.BIMONTHLY;
    const needsYearOnly = mode === ReportingPeriodType.ANNUAL;
    const needsDateRange = mode === ReportingPeriodType.DATE_RANGE;

    // 1) Drop controls the new mode genuinely doesn't need.
    if (!needsYearMonth && !needsYearOnly && form.get('year')) {
      form.removeControl('year');
    }
    if (!needsYearMonth && form.get('month')) {
      form.removeControl('month');
    }
    if (!needsDateRange) {
      if (form.get('startDate')) form.removeControl('startDate');
      if (form.get('endDate')) form.removeControl('endDate');
    }

    // 2) Add or reconcile year.
    if (needsYearMonth || needsYearOnly) {
      if (!form.get('year')) {
        form.addControl('year', this.fb.control(defaults?.year ?? null, Validators.required));
      }
      // else: keep whatever the user already chose.
    }

    // 3) Add or reconcile month. When switching MONTHLY → BIMONTHLY, the
    //    existing month may not be a valid bimonthly anchor (1,3,5,7,9,11) —
    //    convert it via setValue on the SAME control instance.
    if (needsYearMonth) {
      if (!form.get('month')) {
        const seed = mode === ReportingPeriodType.BIMONTHLY && defaults?.bimonthlyDefaultMonth != null
          ? defaults.bimonthlyDefaultMonth
          : defaults?.month;
        form.addControl('month', this.fb.control(this.getDefaultMonthForMode(mode, seed), Validators.required));
      } else if (mode === ReportingPeriodType.BIMONTHLY) {
        const validBimonthly = ['1', '3', '5', '7', '9', '11'];
        const current = form.get('month')?.value;
        if (current == null || !validBimonthly.includes(String(current))) {
          const seed = current ?? defaults?.bimonthlyDefaultMonth ?? defaults?.month;
          form.get('month')?.setValue(this.getDefaultMonthForMode(mode, seed));
        }
      }
      // For MONTHLY: any 1–12 is valid, so preserve existing as-is.
    }

    // 4) Add date-range controls if needed.
    if (needsDateRange) {
      if (!form.get('startDate')) {
        form.addControl('startDate', this.fb.control(defaults?.startDate ?? null, Validators.required));
      }
      if (!form.get('endDate')) {
        form.addControl('endDate', this.fb.control(defaults?.endDate ?? null, Validators.required));
      }
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
