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
import { catchError, forkJoin, map, of, Subject, switchMap, take } from 'rxjs';
import { SegmentedControlComponent, SegmentedOption } from 'src/app/components/segmented-control/segmented-control.component';
import { CustomDateRangeComponent } from '../../components/custom-date-range/custom-date-range.component';
import { LineChartComponent, LineChartSeries } from 'src/app/widgets/line-chart/line-chart.component';
import { DonutChartComponent, DonutChartItem } from 'src/app/widgets/donut-chart/donut-chart.component';
import { FilterDropdownComponent } from 'src/app/widgets/filter-dropdown/filter-dropdown.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { inputsSize } from 'src/app/shared/enums';
import { ISelectItem } from 'src/app/shared/interface';
import { TransactionsService } from '../transactions/transactions.page.service';
import { FlowAnalysisService, FlowAnalysisResponse } from './flow-analysis.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import {
  FilterGroup,
  FilterOption,
  FlowFilterScreen,
} from './flow-analysis-filter.interfaces';

type ApiFilterType = 'all' | 'category' | 'subCategory' | 'merchant' | 'paymentMethod';

const SCREEN_TO_API: Record<Exclude<FlowFilterScreen, 'main'>, ApiFilterType> = {
  categories:     'category',
  subCategories:  'subCategory',
  businesses:     'merchant',
  paymentMethods: 'paymentMethod',
};

const MAIN_MENU: FilterOption[] = [
  { id: 'categories',     label: 'קטגוריות' },
  { id: 'subCategories',  label: 'תת-קטגוריות' },
  { id: 'businesses',     label: 'בית עסק' },
  { id: 'paymentMethods', label: 'אמצעי תשלום' },
];

type LineDisplayMode = 'expenses' | 'incomes' | 'incomes-vs-expenses';

const DONUT_COLORS = [
  '#8B5CF6', '#45C486', '#37CBE0', '#FFD233',
  '#FF9F2D', '#FF4B6E', '#6C63FF', '#F87171', '#A3E635',
];

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
    case '3_MONTHS': return { dateFrom: new Date(today.getFullYear(), today.getMonth() - 2, 1), dateTo: today };
    case '6_MONTHS': return { dateFrom: new Date(today.getFullYear(), today.getMonth() - 5, 1), dateTo: today };
    case 'YEAR': {
      const dateFrom = new Date(today);
      dateFrom.setFullYear(dateFrom.getFullYear() - 1);
      dateFrom.setDate(dateFrom.getDate() + 1);
      return { dateFrom, dateTo: today };
    }
    default: return { dateFrom: null, dateTo: null };
  }
}

const customRangeValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const fg = group as FormGroup;
  if (fg.get('period')?.value !== 'CUSTOM') return null;
  const dateFrom = fg.get('dateFrom')?.value as Date | null;
  const dateTo   = fg.get('dateTo')?.value as Date | null;
  if (!dateFrom || !dateTo) return { customRangeRequired: true };
  const start = startOfDay(dateFrom);
  const end   = startOfDay(dateTo);
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
    FilterDropdownComponent,
    InputSelectComponent,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
  ],
})
export class FlowAnalysisComponent {
  private transactionService  = inject(TransactionsService);
  private flowAnalysisService = inject(FlowAnalysisService);
  private expenseDataService  = inject(ExpenseDataService);

  inputsSize = inputsSize;
  accountsList: Signal<ISelectItem[]> = this.transactionService.accountsList;
  // defaultAccount = computed(() => this.accountsList()[0]?.value as string);
  readonly overlayPositions: ConnectedPosition[] = [
    { originX: 'end',   originY: 'bottom', overlayX: 'end',   overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ];

  readonly showCustomRange = signal(false);

  readonly myForm = new FormGroup(
    {
      period:   new FormControl<string | null>(null, Validators.required),
      dateFrom: new FormControl<Date | null>(null),
      dateTo:   new FormControl<Date | null>(null),
      account:  new FormControl<string | null>(null, Validators.required),
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

  readonly chartTypeOptions: SegmentedOption[] = [
    { value: 'line', label: 'קו' },
    { value: 'bar',  label: 'עמודות' },
  ];

  readonly chartTypeForm = new FormGroup({
    type: new FormControl<'line' | 'bar'>('line'),
  });

  readonly chartType = toSignal(
    this.chartTypeForm.controls.type.valueChanges,
    { initialValue: 'line' as 'line' | 'bar' },
  );

  readonly loading  = signal(false);
  readonly hasError = signal(false);

  private readonly formStatus = toSignal(this.myForm.statusChanges, { initialValue: this.myForm.status });
  private readonly formValue  = toSignal(this.myForm.valueChanges,  { initialValue: this.myForm.value  });

  readonly canSubmit = computed(() => {
    const v = this.formValue();
    return !!v.account && !!v.dateFrom && !!v.dateTo && this.formStatus() === 'VALID';
  });

  private readonly period = toSignal(
    this.myForm.controls.period.valueChanges,
    { initialValue: '3_MONTHS' },
  );

  // Track account value reactively so effects can react to changes
  private readonly accountValue = toSignal(
    this.myForm.controls.account.valueChanges,
    { initialValue: this.myForm.controls.account.value },
  );

  // ── Filter state ─────────────────────────────────────────────────────────
  readonly filterScreen      = signal<FlowFilterScreen>('main');
  readonly selectedIds       = signal<ReadonlySet<string>>(new Set());
  readonly selectedFilterType = signal<ApiFilterType>('all');

  readonly allCategories     = signal<FilterOption[]>([]);
  readonly allSubCategories  = signal<FilterGroup[]>([]);
  readonly allBusinesses     = signal<FilterOption[]>([]);
  readonly allPaymentMethods = signal<FilterOption[]>([]);

  private readonly categoriesLoaded     = signal(false);
  private readonly subCategoriesLoaded  = signal(false);
  private readonly merchantsLoaded      = signal(false);
  private readonly paymentMethodsLoaded = signal(false);

  // ── Filter computed ───────────────────────────────────────────────────────

  /** Whole filter is disabled until an account is selected */
  readonly isFilterDisabled = computed(() => !this.accountValue());

  readonly filterScreenTitle = computed<string | null>(() => {
    switch (this.filterScreen()) {
      case 'categories':     return 'קטגוריות';
      case 'subCategories':  return 'תת-קטגוריות';
      case 'businesses':     return 'בית עסק';
      case 'paymentMethods': return 'אמצעי תשלום';
      default:               return null;
    }
  });

  readonly dropdownItems = computed<FilterOption[]>(() => {
    switch (this.filterScreen()) {
      case 'main':           return MAIN_MENU;
      case 'categories':     return this.allCategories();
      case 'businesses':     return this.allBusinesses();
      case 'paymentMethods': return this.allPaymentMethods();
      default:               return [];
    }
  });

  readonly dropdownGrouped = computed<FilterGroup[]>(() =>
    this.filterScreen() === 'subCategories' ? this.allSubCategories() : []
  );

  readonly isDropdownGrouped = computed(() => this.filterScreen() === 'subCategories');
  readonly showDropdownBack  = computed(() => this.filterScreen() !== 'main');

  /** Badge: always reflect the active selection, independent of current screen */
  readonly activeFilterCount = computed(() => this.selectedIds().size);

  // ── Submit pipeline ───────────────────────────────────────────────────────
  private readonly submit$ = new Subject<void>();

  readonly apiData = toSignal(
    this.submit$.pipe(
      switchMap(() => {
        const v = this.myForm.value;
        this.loading.set(true);
        this.hasError.set(false);
        const { lineFilterType, lineFilterValue } = this.resolveApiFilter();
        return this.flowAnalysisService.getFlowAnalysis(
          toDateString(v.dateFrom!),
          toDateString(v.dateTo!),
          v.account!,
          lineFilterType,
          lineFilterValue,
        ).pipe(
          map(data => { this.loading.set(false); return data as FlowAnalysisResponse | null; }),
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
    const mode   = this.lineDisplayMode();
    const labels = data.monthlyFlow.map(m => monthLabel(m.month));
    const expensesSeries: LineChartSeries = {
      name: 'הוצאות', color: '#6C63FF',
      data: data.monthlyFlow.map((m, i) => ({ label: labels[i], value: m.expenses })),
    };
    const incomesSeries: LineChartSeries = {
      name: 'הכנסות', color: '#45C486',
      data: data.monthlyFlow.map((m, i) => ({ label: labels[i], value: m.incomes })),
    };
    if (mode === 'expenses') return [expensesSeries];
    if (mode === 'incomes')  return [incomesSeries];
    return [expensesSeries, incomesSeries];
  });

  readonly isLineChartEmpty = computed(() => {
    const series = this.cashflowSeries();
    return series.length === 0 || series.every(s => s.data.every(p => p.value === 0));
  });

  readonly categoryExpensesData = computed<DonutChartItem[]>(() => {
    const data = this.apiData();
    if (!data?.expensesByCategory?.length) return [];
    return data.expensesByCategory.map((cat, i) => ({
      label:  cat.label ?? 'ללא קטגוריה',
      value:  cat.percentage,
      amount: cat.amount,
      color:  DONUT_COLORS[i % DONUT_COLORS.length],
    }));
  });

  readonly isDonutEmpty = computed(() => this.categoryExpensesData().length === 0);

  constructor() {
    this.transactionService.ensureAccountsLoaded();
    this.myForm.patchValue(calculatePeriodRange('3_MONTHS'));

    effect(() => {
      const period = this.period();
      if (period === 'CUSTOM') { this.showCustomRange.set(true); return; }
      this.showCustomRange.set(false);
      this.myForm.patchValue(calculatePeriodRange(period));
    });

    effect(() => {
      const account = this.accountsList()[0]?.value as string;
      if (account) {
        this.myForm.get('account')?.setValue(account);
      }
    });

    // When account changes: reset all filter state and mark lists as stale
    effect(() => {
      this.accountValue(); // read to subscribe
      this.resetFilterState();
    });
  }

  submit(): void { this.submit$.next(); }

  closeCustomRange(): void { this.showCustomRange.set(false); }

  // ── Filter handlers ───────────────────────────────────────────────────────

  onFilterItemClicked(id: string): void {
    const screen = this.filterScreen();

    if (screen === 'main') {
      // Navigate to the selected inner screen
      this.filterScreen.set(id as FlowFilterScreen);
      this.lazyLoadScreen(id as FlowFilterScreen);
      return;
    }

    // Inner screen: record the selection (component closes itself)
    this.selectedIds.set(new Set([id]));
    this.selectedFilterType.set(SCREEN_TO_API[screen as Exclude<FlowFilterScreen, 'main'>]);
    this.filterScreen.set('main');
  }

  onFilterBack(): void {
    this.filterScreen.set('main');
  }

  onFilterClearAll(): void {
    // "הכל" — clear selection and close (component closes itself)
    this.selectedIds.set(new Set());
    this.selectedFilterType.set('all');
    this.filterScreen.set('main');
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private resetFilterState(): void {
    this.selectedIds.set(new Set());
    this.selectedFilterType.set('all');
    this.filterScreen.set('main');
    this.categoriesLoaded.set(false);
    this.subCategoriesLoaded.set(false);
    this.merchantsLoaded.set(false);
    this.paymentMethodsLoaded.set(false);
    this.allCategories.set([]);
    this.allSubCategories.set([]);
    this.allBusinesses.set([]);
    this.allPaymentMethods.set([]);
  }

  private lazyLoadScreen(screen: FlowFilterScreen): void {
    switch (screen) {
      case 'categories':     if (!this.categoriesLoaded())     this.loadCategories();     break;
      case 'subCategories':  if (!this.subCategoriesLoaded())  this.loadSubCategories();  break;
      case 'businesses':     if (!this.merchantsLoaded())      this.loadMerchants();      break;
      case 'paymentMethods': if (!this.paymentMethodsLoaded()) this.loadPaymentMethods(); break;
    }
  }

  private loadCategories(): void {
    this.transactionService.getCategories(null, true)
      .pipe(take(1))
      .subscribe(items => {
        this.allCategories.set(items.map(i => ({ id: i.value as string, label: i.name as string })));
        this.categoriesLoaded.set(true);
      });
  }

  private loadSubCategories(): void {
    const billId = this.myForm.controls.account.value;
    if (!billId) return;

    forkJoin({
      defaults: this.expenseDataService.getAllDefaultSubCategories().pipe(take(1)),
      user:     this.expenseDataService.getAllUserSubCategories(billId).pipe(take(1)),
    }).subscribe(({ defaults, user }) => {
      // Merge: user subcategory takes precedence over default with same (categoryName, subCategoryName)
      const seen = new Map<string, FilterOption>();
      const grouped = new Map<string, FilterOption[]>();

      const addRow = (r: any) => {
        const cat = typeof r.categoryName === 'object' && r.categoryName !== null
          ? ((r.categoryName as any).categoryName ?? 'ללא קטגוריה')
          : (r.categoryName ?? 'ללא קטגוריה');
        const sub = r.subCategoryName as string;
        const key = `${cat}||${sub}`;
        if (seen.has(key)) return; // already added (user rows added first, so defaults skip dupes)
        seen.set(key, { id: sub, label: sub });
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push({ id: sub, label: sub });
      };

      // User rows first so they win the dedup check
      user.forEach(addRow);
      defaults.forEach(addRow);

      const groups: FilterGroup[] = [];
      grouped.forEach((items, groupLabel) => groups.push({ groupId: groupLabel, groupLabel, items }));
      this.allSubCategories.set(groups);
      this.subCategoriesLoaded.set(true);
    });
  }

  private loadMerchants(): void {
    const billId = this.myForm.controls.account.value;
    if (!billId) return;
    this.flowAnalysisService.getMerchants(billId)
      .pipe(take(1))
      .subscribe(names => {
        this.allBusinesses.set(names.map(n => ({ id: n, label: n })));
        this.merchantsLoaded.set(true);
      });
  }

  private loadPaymentMethods(): void {
    const billId = this.myForm.controls.account.value;
    if (!billId) return;
    this.transactionService.getSourcesByBillId(Number(billId))
      .pipe(take(1))
      .subscribe((sources: string[]) => {
        this.allPaymentMethods.set(sources.map(s => ({ id: s, label: s })));
        this.paymentMethodsLoaded.set(true);
      });
  }

  private resolveApiFilter(): { lineFilterType: ApiFilterType; lineFilterValue?: string } {
    const type = this.selectedFilterType();
    const ids  = this.selectedIds();

    if (type === 'all' || ids.size === 0) {
      return { lineFilterType: 'all' };
    }

    return { lineFilterType: type, lineFilterValue: [...ids][0] };
  }
}
