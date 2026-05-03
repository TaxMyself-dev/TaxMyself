import { Component, computed, effect, inject, Signal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
import { SegmentedControlComponent, SegmentedOption } from 'src/app/components/segmented-control/segmented-control.component';
import { CustomDateRangeComponent } from './custom-date-range.component';
import { LineChartComponent, LineChartSeries } from 'src/app/widgets/line-chart/line-chart.component';
import { DonutChartComponent, DonutChartItem } from 'src/app/widgets/donut-chart/donut-chart.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { inputsSize } from 'src/app/shared/enums';
import { ISelectItem } from 'src/app/shared/interface';
import { TransactionsService } from '../transactions/transactions.page.service';
import { FlowAnalysisService, FlowAnalysisResponse } from './flow-analysis.service';

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' });
}

function calculatePeriodRange(period: string): { dateFrom: Date | null; dateTo: Date | null } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (period) {
    case '3_MONTHS': {
      return { dateFrom: new Date(today.getFullYear(), today.getMonth() - 2, 1), dateTo: today };
    }
    case '6_MONTHS': {
      return { dateFrom: new Date(today.getFullYear(), today.getMonth() - 5, 1), dateTo: today };
    }
    case 'YEAR': {
      const dateFrom = new Date(today);
      dateFrom.setFullYear(dateFrom.getFullYear() - 1);
      dateFrom.setDate(dateFrom.getDate() + 1);
      return { dateFrom, dateTo: today };
    }
    default:
      return { dateFrom: null, dateTo: null };
  }
}

const customRangeValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const fg = group as FormGroup;
  if (fg.get('period')?.value !== 'CUSTOM') return null;

  const dateFrom = fg.get('dateFrom')?.value as Date | null;
  const dateTo = fg.get('dateTo')?.value as Date | null;
  if (!dateFrom || !dateTo) return { customRangeRequired: true };

  const start = startOfDay(dateFrom);
  const end = startOfDay(dateTo);
  const today = startOfDay(new Date());

  if (end <= start) return { customRangeEndBeforeStart: true };

  if (isSameDate(end, today)) {
    const allowedStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    return start <= allowedStart ? null : { customRangeTooShort: true };
  }

  const minEnd = new Date(start.getFullYear(), start.getMonth() + 3, start.getDate());
  return end >= minEnd ? null : { customRangeTooShort: true };
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

const DONUT_COLORS = [
  '#8B5CF6', '#45C486', '#37CBE0', '#FFD233',
  '#FF9F2D', '#FF4B6E', '#6C63FF', '#F87171', '#A3E635',
];

type LineDisplayMode = 'expenses' | 'incomes' | 'incomes-vs-expenses';

@Component({
  selector: 'app-flow-analysis',
  templateUrl: './flow-analysis.component.html',
  styleUrls: ['./flow-analysis.component.scss'],
  imports: [
    SegmentedControlComponent,
    ReactiveFormsModule,
    CustomDateRangeComponent,
    LineChartComponent,
    DonutChartComponent,
    InputSelectComponent,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
  ],
})
export class FlowAnalysisComponent {
  private transactionService = inject(TransactionsService);
  private flowAnalysisService = inject(FlowAnalysisService);

  inputsSize = inputsSize;
  accountsList: Signal<ISelectItem[]> = this.transactionService.accountsList;

  readonly overlayPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ];

  readonly showCustomRange = signal(false);

  readonly myForm = new FormGroup(
    {
      period:   new FormControl<string | null>(null, Validators.required),
      dateFrom: new FormControl<Date | null>(null),
      dateTo:   new FormControl<Date | null>(null),
      account:  new FormControl<string | null>(null,Validators.required),
    },
    { validators: customRangeValidator },
  );

  readonly periodOptions: SegmentedOption[] = [
    { value: '3_MONTHS', label: '3 חודשים' },
    { value: '6_MONTHS', label: 'חצי שנה' },
    { value: 'YEAR',     label: 'שנה' },
    { value: 'CUSTOM',   label: 'אחר' },
  ];

  readonly lineDisplayOptions: SegmentedOption[] = [
    { value: 'expenses',            label: 'הוצאות' },
    { value: 'incomes',             label: 'הכנסות' },
    { value: 'incomes-vs-expenses', label: 'הוצאות מול הכנסות' },
  ];

  readonly lineDisplayForm = new FormGroup({
    mode: new FormControl<LineDisplayMode>('expenses'),
  });

  readonly lineDisplayMode = toSignal(
    this.lineDisplayForm.controls.mode.valueChanges,
    { initialValue: 'expenses' as LineDisplayMode },
  );

  readonly loading = signal(false);
  readonly hasError = signal(false);

  // Track form state as signals so canSubmit stays reactive
  private readonly formStatus = toSignal(this.myForm.statusChanges, { initialValue: this.myForm.status });
  private readonly formValue  = toSignal(this.myForm.valueChanges,  { initialValue: this.myForm.value  });

  readonly canSubmit = computed(() => {
    const v = this.formValue();
    const status = this.formStatus();
    const result = !!v.account && !!v.dateFrom && !!v.dateTo && status === 'VALID';
    console.log('[FlowAnalysis] form value', this.myForm.value);
    console.log('[FlowAnalysis] form valid', this.myForm.valid);
    console.log('[FlowAnalysis] canSubmit', result);
    return result;
  });

  private readonly period = toSignal(
    this.myForm.controls.period.valueChanges,
    { initialValue: '3_MONTHS' },
  );

  private readonly submit$ = new Subject<void>();

  readonly apiData = toSignal(
    this.submit$.pipe(
      switchMap(() => {
        const v = this.myForm.value;
        this.loading.set(true);
        this.hasError.set(false);
        return this.flowAnalysisService.getFlowAnalysis(
          toDateString(v.dateFrom!),
          toDateString(v.dateTo!),
          v.account!,
          'all',
        ).pipe(
          map(data => {
            this.loading.set(false);
            return data as FlowAnalysisResponse | null;
          }),
          catchError(() => {
            this.hasError.set(true);
            this.loading.set(false);
            return of(null as FlowAnalysisResponse | null);
          }),
        );
      }),
    ),
    { initialValue: null as FlowAnalysisResponse | null },
  );

  readonly totalExpenses = computed(() => this.apiData()?.totalExpenses ?? 0);

  readonly cashflowSeries = computed<LineChartSeries[]>(() => {
    const data = this.apiData();
    if (!data?.monthlyFlow?.length) return [];

    const mode = this.lineDisplayMode();
    const labels = data.monthlyFlow.map(m => monthLabel(m.month));

    const expensesSeries: LineChartSeries = {
      name: 'הוצאות',
      color: '#6C63FF',
      data: data.monthlyFlow.map((m, i) => ({ label: labels[i], value: m.expenses })),
    };
    const incomesSeries: LineChartSeries = {
      name: 'הכנסות',
      color: '#45C486',
      data: data.monthlyFlow.map((m, i) => ({ label: labels[i], value: m.incomes })),
    };

    if (mode === 'expenses') return [expensesSeries];
    if (mode === 'incomes')  return [incomesSeries];
    return [expensesSeries, incomesSeries];
  });

  // True when every data point of the active series is zero
  readonly isLineChartEmpty = computed(() => {
    const series = this.cashflowSeries();
    return series.length === 0 || series.every(s => s.data.every(p => p.value === 0));
  });

  readonly categoryExpensesData = computed<DonutChartItem[]>(() => {
    const data = this.apiData();
    if (!data?.expensesByCategory?.length) return [];

    return data.expensesByCategory.map((cat, i) => ({
      label: cat.label === 'OTHER' ? 'אחר' : (cat.label ?? 'ללא קטגוריה'),
      value: cat.percentage,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));
  });

  readonly isDonutEmpty = computed(() => this.categoryExpensesData().length === 0);

  readonly hasMoreCategories = computed(() => this.apiData()?.hasMoreCategories ?? false);

  constructor() {
    this.myForm.patchValue(calculatePeriodRange('3_MONTHS'));

    this.myForm.valueChanges.subscribe(v => {
      console.log('[FlowAnalysis] Form changed:', v);
    });

    effect(() => {
      const period = this.period();
      if (period === 'CUSTOM') {
        this.showCustomRange.set(true);
        return;
      }
      this.showCustomRange.set(false);
      this.myForm.patchValue(calculatePeriodRange(period));
    });
  }

  submit(): void {
    const v = this.myForm.value;
    console.log('[FlowAnalysis] Submit params:', {
      account: v.account,
      dateFrom: v.dateFrom,
      dateTo: v.dateTo,
      lineFilterType: 'all',
      lineFilterValue: undefined,
    });
    this.submit$.next();
  }

  closeCustomRange(): void {
    this.showCustomRange.set(false);
  }
}
