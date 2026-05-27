import { Component, computed, effect, inject, Signal, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { catchError, EMPTY, filter, forkJoin, map, of, Subject, switchMap, take, tap } from 'rxjs';
import { SegmentedControlComponent, SegmentedOption } from 'src/app/components/segmented-control/segmented-control.component';
import { CustomDateRangeComponent } from '../../components/custom-date-range/custom-date-range.component';
import { GraphViewSettingsComponent } from 'src/app/components/graph-view-settings/graph-view-settings.component';
import { LineChartComponent, LineChartSeries } from 'src/app/widgets/line-chart/line-chart.component';
import { DonutChartComponent, DonutChartItem } from 'src/app/widgets/donut-chart/donut-chart.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { inputsSize } from 'src/app/shared/enums';
import { ISelectItem } from 'src/app/shared/interface';
import { TransactionsService } from '../transactions/transactions.page.service';
import { FlowAnalysisService, FlowAnalysisResponse } from './flow-analysis.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { AuthService } from 'src/app/services/auth.service';
import { ButtonComponent } from "src/app/components/button/button.component";
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';

type ApiFilterType = 'all' | 'category' | 'subCategory' | 'merchant' | 'paymentMethod';

interface FilterChip { label: string; value: string; }

type FormSnapshot = {
  period: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  account: string | null;
  filterType: ApiFilterType;
  category: string | null;
  subCategory: string | null;
  merchant: string | null;
  paymentMethod: string | null;
};

const DONUT_COLORS = [
  '#8B5CF6', '#45C486', '#37CBE0', '#FFD233',
  '#FF9F2D', '#FF4B6E', '#6C63FF', '#F87171', '#A3E635',
];

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateHebrew(d: Date): string {
  const dt = new Date(d);
  const day   = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year  = dt.getFullYear();
  return `${day}/${month}/${year}`;
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
    InputSelectComponent,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    ButtonComponent,
    GraphViewSettingsComponent,
],
})
export class FlowAnalysisComponent {
  private transactionService  = inject(TransactionsService);
  private flowAnalysisService = inject(FlowAnalysisService);
  private expenseDataService  = inject(ExpenseDataService);
  private authService         = inject(AuthService);

  inputsSize = inputsSize;
  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  accountsList: Signal<ISelectItem[]> = this.transactionService.accountsList;

  readonly overlayPositions: ConnectedPosition[] = [
    { originX: 'end',   originY: 'bottom', overlayX: 'end',   overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ];

  readonly graphSettingsPositions: ConnectedPosition[] = [
    // Primary: right-edge-aligned → popup opens leftward (prevents right-side clipping)
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top',    offsetY:  8 },
    // Fallback: open above trigger if bottom is clipped
    { originX: 'end', originY: 'top',    overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
    // Last resort: left-edge-aligned (if trigger is near left edge)
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ];

  readonly showCustomRange    = signal(false);
  readonly showGraphSettings  = signal(false);

  // ── Graph presentation state (pure UI — does not affect backend queries) ──
  readonly graphChartType  = signal<'line' | 'bar'>('line');
  readonly showExpenses    = signal(true);
  readonly showIncomes     = signal(true);

  // ── Single form: all request + filter state ────────────────────────────────
  readonly myForm = new FormGroup(
    {
      period:        new FormControl<string | null>('3_MONTHS', Validators.required),
      dateFrom:      new FormControl<Date | null>(null),
      dateTo:        new FormControl<Date | null>(null),
      account:       new FormControl<string | null>(null, Validators.required),
      filterType:    new FormControl<ApiFilterType>('all'),
      category:      new FormControl<string | null>(null),
      subCategory:   new FormControl<string | null>(null),
      merchant:      new FormControl<string | null>(null),
      paymentMethod: new FormControl<string | null>(null),
    },
    { validators: customRangeValidator },
  );

  readonly periodOptions: SegmentedOption[] = [
    { value: '3_MONTHS', label: '3 חודשים' },
    { value: '6_MONTHS', label: 'חצי שנה' },
    { value: 'YEAR',     label: 'שנה' },
    { value: 'CUSTOM',   label: 'אחר' },
  ];

  readonly loading  = signal(false);
  readonly hasError = signal(false);

  readonly lastSubmittedFormValue = signal<FormSnapshot | null>(null);

  readonly submittedFilterChips = computed<FilterChip[]>(() => {
    const v = this.lastSubmittedFormValue();
    if (!v) return [];

    const chips: FilterChip[] = [];

    // Account
    const accountItem = this.accountsList().find(a => String(a.value) === String(v.account));
    const accountLabel = String(accountItem?.name ?? v.account ?? '');
    if (accountLabel) chips.push({ label: 'חשבון', value: accountLabel });

    // Date — always show actual date range
    if (v.dateFrom && v.dateTo) {
      chips.push({ label: 'זמן', value: `${formatDateHebrew(v.dateTo)} - ${formatDateHebrew(v.dateFrom)}` });
    }

    // Filter type + value
    switch (v.filterType) {
      case 'all':
        chips.push({ label: 'פילטר', value: 'הכל' });
        break;
      case 'category':
        if (v.category) chips.push({ label: 'קטגוריה', value: v.category });
        break;
      case 'subCategory':
        if (v.category)    chips.push({ label: 'קטגוריה',    value: v.category });
        if (v.subCategory) chips.push({ label: 'תת קטגוריה', value: v.subCategory });
        break;
      case 'merchant':
        if (v.merchant) chips.push({ label: 'בית עסק', value: v.merchant });
        break;
      case 'paymentMethod':
        if (v.paymentMethod) chips.push({ label: 'אמצעי תשלום', value: v.paymentMethod });
        break;
    }

    return chips;
  });

  private previousAccount: string | null = null;

  private readonly initialRequestSent = signal(false);

  private readonly formStatus = toSignal(this.myForm.statusChanges, { initialValue: this.myForm.status });
  private readonly formValue  = toSignal(this.myForm.valueChanges,  { initialValue: this.myForm.value });

  // ── Filter type options ────────────────────────────────────────────────────
  readonly filterTypeItems: ISelectItem[] = [
    { value: 'all',           name: 'הכל' },
    { value: 'category',      name: 'קטגוריה' },
    { value: 'subCategory',   name: 'תת קטגוריה' },
    { value: 'merchant',      name: 'בית עסק' },
    { value: 'paymentMethod', name: 'אמצעי תשלום' },
  ];

  // ── Derived from formValue so the reactive graph updates automatically ───────
  readonly selectedFilterType = computed<ApiFilterType>(
    () => (this.formValue()?.filterType ?? 'all') as ApiFilterType,
  );

  // ── Option lists ───────────────────────────────────────────────────────────
  readonly categoryItems      = signal<ISelectItem[]>([]);
  readonly subCategoryItems   = signal<ISelectItem[]>([]);
  readonly merchantItems      = signal<ISelectItem[]>([]);
  readonly paymentMethodItems = signal<ISelectItem[]>([]);

  readonly subCategoriesLoading = signal(false);

  private readonly categoriesLoaded     = signal(false);
  private readonly merchantsLoaded      = signal(false);
  private readonly paymentMethodsLoaded = signal(false);

  // ── Visibility computeds ───────────────────────────────────────────────────
  readonly showCategorySelect = computed(() => {
    const t = this.selectedFilterType();
    return t === 'category' || t === 'subCategory';
  });
  readonly showSubCategorySelect   = computed(() => this.selectedFilterType() === 'subCategory');
  readonly showMerchantSelect      = computed(() => this.selectedFilterType() === 'merchant');
  readonly showPaymentMethodSelect = computed(() => this.selectedFilterType() === 'paymentMethod');

  readonly isFilterDisabled     = computed(() => !this.formValue()?.account);
  readonly isSubCategoryDisabled = computed(() =>
    !this.formValue()?.category || this.subCategoriesLoading()
  );

  // ── canSubmit: base validity + dynamic filter requirements ─────────────────
  readonly canSubmit = computed(() => {
    const v = this.formValue();
    const baseOk = !!v.account && !!v.dateFrom && !!v.dateTo && this.formStatus() === 'VALID';
    if (!baseOk) return false;
    switch (v.filterType) {
      case 'category':      return !!v.category;
      case 'subCategory':   return !!v.category && !!v.subCategory;
      case 'merchant':      return !!v.merchant;
      case 'paymentMethod': return !!v.paymentMethod;
      default:              return true;
    }
  });

  private readonly period = toSignal(
    this.myForm.controls.period.valueChanges,
    { initialValue: '3_MONTHS' },
  );

  private readonly accountValue = toSignal(
    this.myForm.controls.account.valueChanges,
    { initialValue: this.myForm.controls.account.value },
  );

  // ── Submit pipeline ────────────────────────────────────────────────────────
  private readonly submit$ = new Subject<void>();

  readonly apiData = toSignal(
    this.submit$.pipe(
      switchMap(() => {
        const v = this.myForm.value;
        this.lastSubmittedFormValue.set({
          period:        v.period        ?? null,
          dateFrom:      v.dateFrom      ?? null,
          dateTo:        v.dateTo        ?? null,
          account:       v.account       ?? null,
          filterType:    (v.filterType   ?? 'all') as ApiFilterType,
          category:      v.category      ?? null,
          subCategory:   v.subCategory   ?? null,
          merchant:      v.merchant      ?? null,
          paymentMethod: v.paymentMethod ?? null,
        });
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
    const labels = data.monthlyFlow.map(m => monthLabel(m.month));
    const result: LineChartSeries[] = [];
    if (this.showExpenses()) {
      result.push({
        name: 'הוצאות', color: '#6C63FF',
        data: data.monthlyFlow.map((m, i) => ({ label: labels[i], value: m.expenses })),
      });
    }
    if (this.showIncomes()) {
      result.push({
        name: 'הכנסות', color: '#45C486',
        data: data.monthlyFlow.map((m, i) => ({ label: labels[i], value: m.incomes })),
      });
    }
    return result;
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

  readonly donutTotalExpenses = computed(() =>
    this.categoryExpensesData().reduce((sum, item) => sum + (item.amount ?? 0), 0)
  );

  constructor() {
    this.transactionService.ensureAccountsLoaded();

    // period → date range
    effect(() => {
      const period = this.period();
      if (period === 'CUSTOM') { this.showCustomRange.set(true); return; }
      this.showCustomRange.set(false);
      this.myForm.patchValue(calculatePeriodRange(period), { emitEvent: false });
    });

    // auto-select first account
    effect(() => {
      const account = this.accountsList()[0]?.value as string;
      if (account && !this.myForm.controls.account.value) {
        this.myForm.controls.account.setValue(account);
      }
    });

    // account changes → update interceptor context, then reset filter state (guard against spurious re-runs)
    effect(() => {
      const account = this.accountValue();
      if (account === this.previousAccount) return;
      this.previousAccount = account;

      if (account) {
        const bn = this.transactionService.billBusinessNumberMap().get(String(account));
        if (bn) {
          this.authService.setActiveBusinessNumber(bn);
        }
      }

      this.resetFilterState();
    });

    // fire initial request once form becomes submittable
    effect(() => {
      if (this.initialRequestSent()) return;
      if (!this.canSubmit()) return;
      this.initialRequestSent.set(true);
      this.submit$.next();
    });

    // filterType changes → clear dependents, lazy-load options
    this.myForm.controls.filterType.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(type => {
        const t = (type ?? 'all') as ApiFilterType;
        // Clear dependent fields without triggering their own subscriptions
        this.myForm.patchValue(
          { category: null, subCategory: null, merchant: null, paymentMethod: null },
          { emitEvent: false },
        );
        this.subCategoryItems.set([]);
        this.subCategoriesLoading.set(false);
        this.loadDataForFilterType(t);
      });

    // category changes → fetch subcategories for that category (switchMap prevents races)
    this.myForm.controls.category.valueChanges.pipe(
      filter(() => this.myForm.controls.filterType.value === 'subCategory'),
      tap(() => {
        this.myForm.controls.subCategory.setValue(null, { emitEvent: false });
        this.subCategoryItems.set([]);
      }),
      switchMap(categoryName => {
        if (!categoryName) return EMPTY;
        this.subCategoriesLoading.set(true);
        return forkJoin({
          eq:    this.expenseDataService.getSubCategory(categoryName, true,  true),
          notEq: this.expenseDataService.getSubCategory(categoryName, false, true),
        }).pipe(
          map(({ eq, notEq }: { eq: any[]; notEq: any[] }) => {
            const seen = new Set<string>();
            const items: ISelectItem[] = [];
            [...eq, ...notEq].forEach((item: any) => {
              const name: string = item.subCategoryName;
              if (name && !seen.has(name)) {
                seen.add(name);
                items.push({ value: name, name });
              }
            });
            return items;
          }),
          catchError(() => of([] as ISelectItem[])),
        );
      }),
      takeUntilDestroyed(),
    ).subscribe(items => {
      this.subCategoriesLoading.set(false);
      this.subCategoryItems.set(items);
    });

  }

  submit(): void { this.submit$.next(); }

  closeCustomRange(): void { this.showCustomRange.set(false); }

  toggleGraphSettings(): void { this.showGraphSettings.update(v => !v); }
  closeGraphSettings():  void { this.showGraphSettings.set(false); }

  onChartTypeChange(type: 'line' | 'bar'): void { this.graphChartType.set(type); }
  onExpensesChange(value: boolean):        void { this.showExpenses.set(value); }
  onIncomesChange(value: boolean):         void { this.showIncomes.set(value); }

  // ── Private helpers ────────────────────────────────────────────────────────

  private resetFilterState(): void {
    // setValue emits so formValue signal (and the computed selectedFilterType) sees 'all'
    this.myForm.controls.filterType.setValue('all');
    this.myForm.patchValue(
      { category: null, subCategory: null, merchant: null, paymentMethod: null },
      { emitEvent: false },
    );
    this.categoryItems.set([]);
    this.subCategoryItems.set([]);
    this.merchantItems.set([]);
    this.paymentMethodItems.set([]);
    this.subCategoriesLoading.set(false);
    this.categoriesLoaded.set(false);
    this.merchantsLoaded.set(false);
    this.paymentMethodsLoaded.set(false);
  }

  private loadDataForFilterType(type: ApiFilterType): void {
    switch (type) {
      case 'category':
      case 'subCategory':
        if (!this.categoriesLoaded()) this.loadCategories();
        break;
      case 'merchant':
        if (!this.merchantsLoaded()) this.loadMerchants();
        break;
      case 'paymentMethod':
        if (!this.paymentMethodsLoaded()) this.loadPaymentMethods();
        break;
    }
  }

  private loadCategories(): void {
    this.transactionService.getCategories(null, true)
      .pipe(take(1))
      .subscribe(items => {
        this.categoryItems.set(items.map(i => ({ value: i.value as string, name: i.name as string })));
        this.categoriesLoaded.set(true);
      });
  }

  private loadMerchants(): void {
    const billId = this.myForm.controls.account.value;
    if (!billId) return;
    this.flowAnalysisService.getMerchants(billId)
      .pipe(take(1))
      .subscribe(names => {
        this.merchantItems.set(names.map(n => ({ value: n, name: n })));
        this.merchantsLoaded.set(true);
      });
  }

  private loadPaymentMethods(): void {
    const billId = this.myForm.controls.account.value;
    if (!billId) return;
    this.transactionService.getSourcesByBillId(Number(billId))
      .pipe(take(1))
      .subscribe((sources: string[]) => {
        this.paymentMethodItems.set(sources.map(s => ({ value: s, name: s })));
        this.paymentMethodsLoaded.set(true);
      });
  }

  private resolveApiFilter(): { lineFilterType: ApiFilterType; lineFilterValue?: string } {
    const v = this.myForm.value;
    switch (v.filterType) {
      case 'category':
        return v.category
          ? { lineFilterType: 'category', lineFilterValue: v.category }
          : { lineFilterType: 'all' };
      case 'subCategory':
        return v.subCategory
          ? { lineFilterType: 'subCategory', lineFilterValue: v.subCategory }
          : { lineFilterType: 'all' };
      case 'merchant':
        return v.merchant
          ? { lineFilterType: 'merchant', lineFilterValue: v.merchant }
          : { lineFilterType: 'all' };
      case 'paymentMethod':
        return v.paymentMethod
          ? { lineFilterType: 'paymentMethod', lineFilterValue: v.paymentMethod }
          : { lineFilterType: 'all' };
      default:
        return { lineFilterType: 'all' };
    }
  }
}
