import { ChangeDetectionStrategy, Component, inject, EventEmitter, Output, Input, ChangeDetectorRef, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { ReportingPeriodType, BusinessMode, inputsSize, doubleMonthsList, singleMonthsList } from 'src/app/shared/enums';
import { InputSelectComponent } from '../input-select/input-select.component';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonComponent } from '../button/button.component';
import { ISelectItem } from 'src/app/shared/interface';
import { ButtonSize } from '../button/button.enum';
import { ButtonColor } from '../button/button.enum';
import { InputDateComponent } from '../input-date/input-date.component';

@Component({
  selector: 'app-period-select',
  templateUrl: './period-select.component.html',
  styleUrls: ['./period-select.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    InputSelectComponent, DatePickerModule, ButtonComponent, InputDateComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodSelectComponent {

  /* ------------ Inputs ------------- */
  // @Input() parentPage!: 'vatReport' | 'pnlReport' | 'uniformFile';
  @Input() businessMode: BusinessMode = BusinessMode.ONE_BUSINESS;
  @Input() businessOptions: ISelectItem[] = [];
  @Input() allowedPeriodModes: ReportingPeriodType[] = [
    ReportingPeriodType.MONTHLY,
    ReportingPeriodType.BIMONTHLY,
    ReportingPeriodType.ANNUAL,
    ReportingPeriodType.DATE_RANGE
  ];
  isLoadingStateButton = input<boolean>(false);

  /* ------------ Outputs ------------ */
  @Output() readonly formSubmit = new EventEmitter<Record<string, any>>();

  /* ------------ Form --------------- */
  readonly fb   = inject(FormBuilder);

//   readonly form = this.fb.group({
//   // periodMode : new FormControl<ReportingPeriodType>(ReportingPeriodType.MONTHLY, Validators.required),
//   periodMode : new FormControl<ReportingPeriodType>(null, Validators.required),
//   year       : new FormControl<number | null>(null),
//   month      : new FormControl<string | number | null>(null),
//   startDate  : new FormControl<Date | null>(null),
//   endDate    : new FormControl<Date | null>(null),
//   business   : new FormControl<string | null>(null),
// });

  readonly form = this.fb.group({
    periodMode : new FormControl<ReportingPeriodType | null>(null, Validators.required),
    year       : new FormControl<number | null>(null),
    month      : new FormControl<string | number | null>(null),
    startDate  : new FormControl<Date | null>(null),
    endDate    : new FormControl<Date | null>(null),
    business   : new FormControl<string | null>(null),
  });

  BusinessMode = BusinessMode;
  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  inputsSize = inputsSize;

  get mode(): ReportingPeriodType | null {
    return this.form.controls.periodMode.value as ReportingPeriodType | null;
  }

  /* ------------ Constructor ---------- */
  // constructor() {

  //   const cdr = inject(ChangeDetectorRef);

  //   // Subscribe to changes in periodMode and reconfigure controls
  //   this.form.controls.periodMode.valueChanges.subscribe(val => {
  //     this.configureControls(val as ReportingPeriodType);
  //     cdr.markForCheck(); // triggers UI update for OnPush
  //   });

  //   // Apply default behavior for 'MONTHLY' at startup
  //   this.configureControls(ReportingPeriodType.MONTHLY);
  // }

//   constructor() {
//   const cdr = inject(ChangeDetectorRef);

//   // Watch for user changes to periodMode
//   this.form.controls.periodMode.valueChanges.subscribe(val => {
//     this.configureControls(val as ReportingPeriodType);
//     cdr.markForCheck();
//   });

//   // Force initial rendering of year + month controls (even if periodMode is empty)
//   this.configureControls('PREVIEW_MONTHLY');
//   // this.configureControls(ReportingPeriodType.MONTHLY);
// }

// constructor() {
//   const cdr = inject(ChangeDetectorRef);

//   // Show fields initially
//   this.form.controls.year.enable();
//   this.form.controls.month.enable();

//   // Set validators manually for the visible fields
//   this.form.controls.year.setValidators([Validators.required]);
//   this.form.controls.month.setValidators([Validators.required]);

//   this.form.controls.year.updateValueAndValidity();
//   this.form.controls.month.updateValueAndValidity();

//   // Watch for when the user actually selects a periodMode
//   this.form.controls.periodMode.valueChanges.subscribe(val => {
//     this.configureControls(val as ReportingPeriodType);
//     cdr.markForCheck();
//   });
// }

constructor() {
  const cdr = inject(ChangeDetectorRef);

  this.form.controls.year.enable();
  this.form.controls.month.enable();
  this.form.controls.year.setValidators([Validators.required]);
  this.form.controls.month.setValidators([Validators.required]);
  this.form.controls.year.updateValueAndValidity();
  this.form.controls.month.updateValueAndValidity();

  this.form.controls.periodMode.valueChanges.subscribe(val => {
    this.configureControls(val as ReportingPeriodType);
    cdr.markForCheck();
  });
}

  ngOnInit(): void {
    // Set business value if there's only one business and one option
    if (
      this.businessMode === BusinessMode.ONE_BUSINESS &&
      this.businessOptions &&
      this.businessOptions.length === 1
    ) {
      this.form.get('business')?.setValue(String(this.businessOptions[0].value));
    }
  }

  onSubmit(): void {
    console.log("form vlaue is ", this.form.value);
    this.formSubmit.emit(this.form.value);
  }

  /* -------------- Helpers ------------- */

  /** enable/disable & (re)set validators according to the chosen mode */
  // private configureControls(mode: ReportingPeriodType) {
  //   const { year, month, startDate, endDate } = this.form.controls;

  //   // Reset control state first
  //   [year, month, startDate, endDate].forEach(c => {
  //     c.clearValidators();
  //     c.reset();
  //     c.disable();
  //   });

  //   switch (mode) {
  //     case ReportingPeriodType.MONTHLY:
  //     case ReportingPeriodType.BIMONTHLY:
  //       year.setValidators([Validators.required]);
  //       month.setValidators([Validators.required]);
  //       year.enable();  month.enable();
  //       break;

  //     case ReportingPeriodType.ANNUAL:
  //       year.setValidators([Validators.required]);
  //       year.enable();
  //       break;

  //     case ReportingPeriodType.DATE_RANGE:
  //       startDate.setValidators([Validators.required]);
  //       endDate.setValidators([Validators.required]);
  //       startDate.enable();  endDate.enable();
  //       break;
  //   }

  //   year.updateValueAndValidity();
  //   month.updateValueAndValidity();
  //   startDate.updateValueAndValidity();
  //   endDate.updateValueAndValidity();
  // }

  private configureControls(mode: ReportingPeriodType | 'PREVIEW_MONTHLY' | null) {
  const { year, month, startDate, endDate } = this.form.controls;

  // Reset all validators and disable everything
  [year, month, startDate, endDate].forEach(c => {
    c.clearValidators();
    c.reset();
    c.disable();
  });

  // 👇 Allow rendering fields even without setting the real value
  switch (mode) {
    case 'PREVIEW_MONTHLY':
    case ReportingPeriodType.MONTHLY:
    case ReportingPeriodType.BIMONTHLY:
      year.enable();  month.enable();
      year.setValidators([Validators.required]);
      month.setValidators([Validators.required]);
      break;

    case ReportingPeriodType.ANNUAL:
      year.enable();
      year.setValidators([Validators.required]);
      break;

    case ReportingPeriodType.DATE_RANGE:
      startDate.enable(); endDate.enable();
      startDate.setValidators([Validators.required]);
      endDate.setValidators([Validators.required]);
      break;
  }

  [year, month, startDate, endDate].forEach(c => c.updateValueAndValidity());
}


  /* ------------- Select lists ---------- */

  getPeriodModeOptions(): ISelectItem[] {
    const all: Record<ReportingPeriodType, string> = {
      [ReportingPeriodType.MONTHLY]: 'חודשי',
      [ReportingPeriodType.BIMONTHLY]: 'דו-חודשי',
      [ReportingPeriodType.ANNUAL]: 'שנתי',
      [ReportingPeriodType.DATE_RANGE]: 'טווח תאריכים',
    };
    return this.allowedPeriodModes.map((mode) => ({
      name: all[mode],
      value: mode
    }));
  }

  generateYears(): ISelectItem[] {
    const currentYear = new Date().getFullYear();
    let years: ISelectItem[] = [];
    for (let i = 0; i <= 20; i++) {
      years.push({ name: currentYear - i, value: currentYear - i });
    }
    return years;
  }

  get monthList(): ISelectItem[] {
  return this.form.controls.periodMode.value === ReportingPeriodType.BIMONTHLY
    ? doubleMonthsList
    : singleMonthsList;
}

  // monthList = computed(() => {
  //   if (this.form.controls.periodMode.value === ReportingPeriodType.BIMONTHLY) {
  //     return doubleMonthsList;
  //   }
  //   return singleMonthsList;
  // });

  // years: ISelectItem[] = (() => {
  //   const y = new Date().getFullYear();
  //   return Array.from({ length: 20 }, (_, i) => ({ name: y - i, value: y - i }));
  // })();

  // monthsSingle  = [{ name: 'ינואר', value: 1 }, /* … */];
  // monthsBiMonth = [{ name: 'ינואר-פברואר', value: '01-02' }, /* … */];

  // getMonthOptions() {
  //   return this.mode === ReportingPeriodType.BIMONTHLY ? this.monthsBiMonth : this.monthsSingle;
  // }

}
