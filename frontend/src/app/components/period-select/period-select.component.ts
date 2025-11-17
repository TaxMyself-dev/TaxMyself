import {
  ChangeDetectionStrategy,
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ReportingPeriodType,
  BusinessMode,
  inputsSize,
  doubleMonthsList,
  singleMonthsList
} from 'src/app/shared/enums';
import { ISelectItem } from 'src/app/shared/interface';
import { InputSelectComponent } from '../input-select/input-select.component';
import { InputDateComponent } from '../input-date/input-date.component';
import { ButtonComponent } from '../button/button.component';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { input } from '@angular/core';


@Component({
  selector: 'app-period-select',
  templateUrl: './period-select.component.html',
  styleUrls: ['./period-select.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputSelectComponent,
    InputDateComponent,
    ButtonComponent,
    DatePickerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodSelectComponent {

  /* ===========================
        Inputs
  ============================ */
  @Input() businessMode: BusinessMode = BusinessMode.ONE_BUSINESS;
  @Input() businessOptions: ISelectItem[] = [];

  // Allowed period modes (can be overridden by parent)
  @Input() allowedPeriodModes: ReportingPeriodType[] = [
    ReportingPeriodType.MONTHLY,
    ReportingPeriodType.BIMONTHLY,
    ReportingPeriodType.ANNUAL,
    ReportingPeriodType.DATE_RANGE
  ];

  // Loading state (signal)
  //isLoadingStateButton = inject(input<boolean>(false));
  isLoadingStateButton = input<boolean>(false);

  /* ===========================
        Outputs
  ============================ */
  @Output() readonly formSubmit = new EventEmitter<Record<string, any>>();

  /* ===========================
        Form Creation
  ============================ */
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  readonly form = this.fb.group({
    periodMode     : [null, Validators.required],
    year           : [null],
    month          : [null],
    startDate      : [null],
    endDate        : [null],
    businessNumber : [null],         // Required only when 2 businesses exist
  });

  BusinessMode = BusinessMode;
  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  inputsSize = inputsSize;

  get mode(): ReportingPeriodType | null {
    return this.form.controls.periodMode.value as ReportingPeriodType | null;
  }

  /* ===========================
        Lifecycle
  ============================ */
  // ngOnInit(): void {
  //   const businessCtrl = this.form.get('businessNumber');

  //   // Auto-select business when there is exactly one
  //   if (this.businessMode === BusinessMode.ONE_BUSINESS && this.businessOptions.length === 1) {
  //     businessCtrl?.setValue(String(this.businessOptions[0].value));
  //   }

  //   // When two businesses → require selection
  //   if (this.businessMode === BusinessMode.TWO_BUSINESS) {
  //     businessCtrl?.setValidators([Validators.required]);
  //     businessCtrl?.updateValueAndValidity();
  //   }

  //   // React to period mode changes
  //   this.form.controls.periodMode.valueChanges.subscribe(mode => {
  //     this.configureControls(mode as ReportingPeriodType);
  //     this.cdr.markForCheck();
  //   });
  // }

  ngOnInit(): void {
  const businessCtrl = this.form.controls.businessNumber;

  if (this.businessMode === BusinessMode.ONE_BUSINESS && this.businessOptions.length === 1) {
    businessCtrl.setValue(String(this.businessOptions[0].value));
    businessCtrl.disable();  // no user choice needed
  }

  if (this.businessMode === BusinessMode.TWO_BUSINESS) {
    businessCtrl.enable(); // <-- SUPER IMPORTANT
    businessCtrl.setValidators([Validators.required]);
    businessCtrl.updateValueAndValidity();
  }

  this.form.controls.periodMode.valueChanges.subscribe(mode => {
    this.configureControls(mode as ReportingPeriodType);
    this.cdr.markForCheck();
  });
}


  /* ===========================
        Form Submit
  ============================ */
  onSubmit(): void {
    this.formSubmit.emit(this.form.value);
  }

  /* ===========================
      Dynamically configure fields
  ============================ */
  private configureControls(mode: ReportingPeriodType | null) {
    const { year, month, startDate, endDate } = this.form.controls;

    // Reset everything
    [year, month, startDate, endDate].forEach(c => {
      c.clearValidators();
      c.reset();
      c.disable();
    });

    // Enable only relevant controls
    switch (mode) {
      case ReportingPeriodType.MONTHLY:
      case ReportingPeriodType.BIMONTHLY:
        year.enable();
        month.enable();
        year.setValidators([Validators.required]);
        month.setValidators([Validators.required]);
        break;

      case ReportingPeriodType.ANNUAL:
        year.enable();
        year.setValidators([Validators.required]);
        break;

      case ReportingPeriodType.DATE_RANGE:
        startDate.enable();
        endDate.enable();
        startDate.setValidators([Validators.required]);
        endDate.setValidators([Validators.required]);
        break;
    }

    // Refresh validators
    [year, month, startDate, endDate].forEach(c => c.updateValueAndValidity());
  }

  /* ===========================
        Select lists
  ============================ */
  getPeriodModeOptions(): ISelectItem[] {
    const labels: Record<ReportingPeriodType, string> = {
      MONTHLY: 'חודשי',
      BIMONTHLY: 'דו-חודשי',
      ANNUAL: 'שנתי',
      DATE_RANGE: 'טווח תאריכים',
    };
    return this.allowedPeriodModes.map(mode => ({
      name: labels[mode],
      value: mode
    }));
  }

  generateYears(): ISelectItem[] {
    const current = new Date().getFullYear();
    return Array.from({ length: 21 }, (_, i) => ({
      name: current - i,
      value: current - i
    }));
  }

  get monthList(): ISelectItem[] {
    return this.mode === ReportingPeriodType.BIMONTHLY
      ? doubleMonthsList
      : singleMonthsList;
  }
}






// import { ChangeDetectionStrategy, Component, inject, EventEmitter, Output, Input, ChangeDetectorRef, input } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormBuilder, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
// import { ReportingPeriodType, BusinessMode, inputsSize, doubleMonthsList, singleMonthsList } from 'src/app/shared/enums';
// import { InputSelectComponent } from '../input-select/input-select.component';
// import { DatePickerModule } from 'primeng/datepicker';
// import { ButtonComponent } from '../button/button.component';
// import { ISelectItem } from 'src/app/shared/interface';
// import { ButtonSize } from '../button/button.enum';
// import { ButtonColor } from '../button/button.enum';
// import { InputDateComponent } from '../input-date/input-date.component';

// @Component({
//   selector: 'app-period-select',
//   templateUrl: './period-select.component.html',
//   styleUrls: ['./period-select.component.scss'],
//   standalone: true,
//   imports: [
//     CommonModule, ReactiveFormsModule,
//     InputSelectComponent, DatePickerModule, ButtonComponent, InputDateComponent
//   ],
//   changeDetection: ChangeDetectionStrategy.OnPush,
// })
// export class PeriodSelectComponent {

//   /* ------------ Inputs ------------- */
//   @Input() businessMode: BusinessMode = BusinessMode.ONE_BUSINESS;
//   @Input() businessOptions: ISelectItem[] = [];
//   @Input() allowedPeriodModes: ReportingPeriodType[] = [
//     ReportingPeriodType.MONTHLY,
//     ReportingPeriodType.BIMONTHLY,
//     ReportingPeriodType.ANNUAL,
//     ReportingPeriodType.DATE_RANGE
//   ];
//   isLoadingStateButton = input<boolean>(false);

//   /* ------------ Outputs ------------ */
//   @Output() readonly formSubmit = new EventEmitter<Record<string, any>>();

//   /* ------------ Form --------------- */
//   readonly fb   = inject(FormBuilder);

//   readonly form = this.fb.group({
//     periodMode : new FormControl<ReportingPeriodType | null>(null, Validators.required),
//     year       : new FormControl<number | null>(null),
//     month      : new FormControl<string | number | null>(null),
//     startDate  : new FormControl<Date | null>(null),
//     endDate    : new FormControl<Date | null>(null),
//     businessNumber   : new FormControl<string | null>(null),
//   });

//   BusinessMode = BusinessMode;
//   buttonSize = ButtonSize;
//   buttonColor = ButtonColor;
//   inputsSize = inputsSize;

//   get mode(): ReportingPeriodType | null {
//     return this.form.controls.periodMode.value as ReportingPeriodType | null;
//   }

// constructor() {
//   const cdr = inject(ChangeDetectorRef);

//   this.form.controls.year.enable();
//   this.form.controls.month.enable();
//   this.form.controls.year.setValidators([Validators.required]);
//   this.form.controls.month.setValidators([Validators.required]);
//   this.form.controls.year.updateValueAndValidity();
//   this.form.controls.month.updateValueAndValidity();

//   this.form.controls.periodMode.valueChanges.subscribe(val => {
//     this.configureControls(val as ReportingPeriodType);
//     cdr.markForCheck();
//   });
// }

//   ngOnInit(): void {
//     // Set business value if there's only one business and one option
//     if (
//       this.businessMode === BusinessMode.ONE_BUSINESS &&
//       this.businessOptions &&
//       this.businessOptions.length === 1
//     ) {
//       this.form.get('businessNumber')?.setValue(String(this.businessOptions[0].value));
//     }
//   }

//   onSubmit(): void {
//     console.log("form vlaue is ", this.form.value);
//     this.formSubmit.emit(this.form.value);
//   }


//   private configureControls(mode: ReportingPeriodType | 'PREVIEW_MONTHLY' | null) {
//   const { year, month, startDate, endDate } = this.form.controls;

//   // Reset all validators and disable everything
//   [year, month, startDate, endDate].forEach(c => {
//     c.clearValidators();
//     c.reset();
//     c.disable();
//   });

//   // 👇 Allow rendering fields even without setting the real value
//   switch (mode) {
//     case 'PREVIEW_MONTHLY':
//     case ReportingPeriodType.MONTHLY:
//     case ReportingPeriodType.BIMONTHLY:
//       year.enable();  month.enable();
//       year.setValidators([Validators.required]);
//       month.setValidators([Validators.required]);
//       break;

//     case ReportingPeriodType.ANNUAL:
//       year.enable();
//       year.setValidators([Validators.required]);
//       break;

//     case ReportingPeriodType.DATE_RANGE:
//       startDate.enable(); endDate.enable();
//       startDate.setValidators([Validators.required]);
//       endDate.setValidators([Validators.required]);
//       break;
//   }

//   [year, month, startDate, endDate].forEach(c => c.updateValueAndValidity());
// }


//   /* ------------- Select lists ---------- */

//   getPeriodModeOptions(): ISelectItem[] {
//     const all: Record<ReportingPeriodType, string> = {
//       [ReportingPeriodType.MONTHLY]: 'חודשי',
//       [ReportingPeriodType.BIMONTHLY]: 'דו-חודשי',
//       [ReportingPeriodType.ANNUAL]: 'שנתי',
//       [ReportingPeriodType.DATE_RANGE]: 'טווח תאריכים',
//     };
//     return this.allowedPeriodModes.map((mode) => ({
//       name: all[mode],
//       value: mode
//     }));
//   }

//   generateYears(): ISelectItem[] {
//     const currentYear = new Date().getFullYear();
//     let years: ISelectItem[] = [];
//     for (let i = 0; i <= 20; i++) {
//       years.push({ name: currentYear - i, value: currentYear - i });
//     }
//     return years;
//   }

//   get monthList(): ISelectItem[] {
//   return this.form.controls.periodMode.value === ReportingPeriodType.BIMONTHLY
//     ? doubleMonthsList
//     : singleMonthsList;
// }


// }
