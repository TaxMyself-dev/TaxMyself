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
  BusinessStatus,
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
import { GenericService } from 'src/app/services/generic.service';


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

  private gs = inject(GenericService);

  /* ===========================
        Inputs
  ============================ */
  @Input() businessStatus: BusinessStatus = BusinessStatus.SINGLE_BUSINESS;
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

  BusinessStatus = BusinessStatus;
  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  inputsSize = inputsSize;

  get mode(): ReportingPeriodType | null {
    return this.form.controls.periodMode.value as ReportingPeriodType | null;
  }

  ngOnInit(): void {
  const businessCtrl = this.form.controls.businessNumber;

  if (this.businessStatus === BusinessStatus.SINGLE_BUSINESS && this.businessOptions.length === 1) {
    businessCtrl.setValue(String(this.businessOptions[0].value));
    businessCtrl.disable();  // no user choice needed
  }

  if (this.businessStatus === BusinessStatus.MULTI_BUSINESS) {
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