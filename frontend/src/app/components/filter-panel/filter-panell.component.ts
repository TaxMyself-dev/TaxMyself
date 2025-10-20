import { AfterViewInit, Component, computed, effect, ElementRef, inject, Injector, input, OnInit, output, runInInjectionContext, Signal, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxModule } from 'primeng/checkbox';
import { CalendarModule } from 'primeng/calendar';
import { ButtonModule } from 'primeng/button';
import { ListboxModule } from 'primeng/listbox';
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize, iconPosition } from '../button/button.enum';
import { inputsSize } from 'src/app/shared/enums';
import { InputSelectComponent } from "../input-select/input-select.component";
import { ISelectItem } from 'src/app/shared/interface';
import { DatePickerModule } from 'primeng/datepicker';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { DateService } from 'src/app/services/date.service';
import { catchError, EMPTY, map } from 'rxjs';

export interface SelectOption {
  name: string;
  value: any;
}

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SelectModule,
    FormsModule,
    MultiSelectModule,
    CheckboxModule,
    CalendarModule,
    ButtonModule,
    ListboxModule,
    ButtonComponent,
    InputSelectComponent,
    DatePickerModule
  ],
  templateUrl: './filter-panel.component.html',
  styleUrls: ['./filter-panel.component.scss']
})
export class FilterPanelComponent implements OnInit, AfterViewInit {
  private readonly injector = inject(Injector);
  private dateService = inject(DateService);
  private transactionService = inject(TransactionsService);

  @ViewChild('menu') menu?: ElementRef<HTMLDivElement>;
  @ViewChild('content') content?: ElementRef<HTMLDivElement>;

  private lastContentHeight = 0;

  isOpen = false;
  readonly EXTRA = 50;
  private ro!: ResizeObserver;

  isVisible = input<boolean>(false);
  readonly applyFilters = output<any>();
  readonly clearFilters = output<void>();
  showTimeOptions = signal(false);
  showAccountsOptions = signal(false);
  showCategoriesOptions = signal(false);
  isCategoryEmpty = signal(false);
  isAccountEmpty = signal(false);
  isPaymentIdentifierEmpty = signal(false);


  buttonText = signal<string>('בחר');
  viewReady = signal(false);
  sourcesList = signal<ISelectItem[]>([]);
  accountsList: Signal<ISelectItem[]> = this.transactionService.accountsList;
  categoryList: Signal<ISelectItem[]> = this.transactionService.categories;

  fullListAccounts: Signal<ISelectItem[]> = computed(() =>
    [{ name: 'אמצעי תשלום לא משוייכים', value: 'notBelong' }, ...this.accountsList()]
  );
  disableFilter = computed(() => this.isAccountEmpty() || this.isCategoryEmpty() || this.buttonText() === 'בחר');


  filterData = signal<any>(null);
  selected: any[] = [];
  selectedType = signal<string>("");

  filteredMonth: ISelectItem[] = [];
  form: FormGroup
  private fb = inject(FormBuilder);


  timeTypes: ISelectItem[] = [
    { name: 'חודשי', value: 'MONTHLY' },
    { name: 'דו-חודשי', value: 'BIMONTHLY' },
    { name: 'שנתי', value: 'ANNUAL' },
    { name: 'טווח תאריכים', value: 'DATE_RANGE' }
  ];

  monthOptions: ISelectItem[] = [
    { name: 'ינואר', value: 1 }, { name: 'פברואר', value: 2 },
    { name: 'מרץ', value: 3 }, { name: 'אפריל', value: 4 },
    { name: 'מאי', value: 5 }, { name: 'יוני', value: 6 },
    { name: 'יולי', value: 7 }, { name: 'אוגוסט', value: 8 },
    { name: 'ספטמבר', value: 9 }, { name: 'אוקטובר', value: 10 },
    { name: 'נובמבר', value: 11 }, { name: 'דצמבר', value: 12 }
  ];

  bimonthOptions: ISelectItem[] = [
    { name: 'ינואר-פברואר', value: 1 },
    { name: 'מרץ-אפריל', value: 3 },
    { name: 'מאי-יוני', value: 5 },
    { name: 'יולי-אוגוסט', value: 7 },
    { name: 'ספטמבר-אוקטובר', value: 9 },
    { name: 'נובמבר-דצמבר', value: 11 }
  ];

  years: ISelectItem[] = [];


  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  inputsSize = inputsSize;
  iconPos = iconPosition;

  constructor() {
    this.form = this.fb.group({
      periodType: new FormControl(
        '', [Validators.required]
      ),
      account: new FormControl(
        [this.accountsList()], [Validators.required]
      ),
      category: new FormControl(
        [this.categoryList()], [Validators.required]
      ),
    });

    effect(() => {
      const categories = this.categoryList();
      if (categories.length > 0) {
        this.form.get('category')?.setValue(categories);
      }
    });


    effect(() => {
      const accounts = this.fullListAccounts();
      if (accounts.length > 0) {
        this.form.get('account')?.setValue(accounts);
      }
    });

    effect(() => {
      const sources = this.sourcesList();
      if (sources.length > 0) {
        this.form.get('sources')?.setValue(sources);
      }
    });
  }

  ngOnInit(): void {
    this.getButtonText();
    this.generateYears();
    this.getCategories();
    this.filterData = this.transactionService.filterData;
  }

  ngAfterViewInit(): void {
    this.viewReady.set(true);

    runInInjectionContext(this.injector, () => {
      effect(() => {
        const visible = this.isVisible();

        queueMicrotask(() => {
          const contentEl = this.content?.nativeElement;
          const menuEl = this.menu?.nativeElement;
          if (!contentEl || !menuEl) return;

          if (!visible) {
            menuEl.style.height = '0px';
            this.isOpen = false;
            return;
          }

          this.lastContentHeight = contentEl.scrollHeight;

          this.ro?.disconnect();
          this.ro = new ResizeObserver(() => {
            const newH = contentEl.scrollHeight;
            if (newH !== this.lastContentHeight) {
              this.lastContentHeight = newH;
              if (this.isOpen) {
                menuEl.style.height = `${newH + this.EXTRA}px`;
              }
            }
          });
          this.ro.observe(contentEl);
        });
      });
    });
  }

  ngOnDestroy() {
    this.ro?.disconnect();
  }

  toggle(forceClose = false) {
    if (!this.viewReady()) return;

    const menuEl = this.menu?.nativeElement;
    const contentEl = this.content?.nativeElement;
    if (!menuEl || !contentEl) return;

    if (forceClose) {
      menuEl.style.height = '0px';
      this.isOpen = false;
      return;
    }

    if (this.isOpen) {
      menuEl.style.height = '0px';
    } else {
      const h = this.lastContentHeight || contentEl.scrollHeight;
      menuEl.style.height = `${h + this.EXTRA}px`;
    }
    this.isOpen = !this.isOpen;
  }

  getCategories(): void {
    this.transactionService.getCategories(null, true)
      .subscribe((res) => {
      })
  }

  updateMonthOptions(): void {
    const selectedYear = this.form?.get('year')?.value;
    const periodType = this.form?.get('periodType')?.value;

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    if (!selectedYear || !periodType) {
      this.filteredMonth = [];
      return;
    }

    if (periodType === 'MONTHLY') {
      this.filteredMonth = this.monthOptions.filter(month => {
        if (selectedYear < currentYear) return true;
        if (selectedYear === currentYear) return Number(month.value) <= currentMonth;
        return false;
      });
    } else if (periodType === 'BIMONTHLY') {
      this.filteredMonth = this.bimonthOptions.filter(option => {
        const monthStart = Number(option.value);
        const monthEnd = monthStart + 1;

        if (selectedYear < currentYear) return true;
        if (selectedYear === currentYear) return monthEnd <= currentMonth;
        return false;
      });
    }
  }

  onSelectCategory(): void {
    this.visibleCategoriesOptions()
  }

  generateYears(): void {
    const currentYear = new Date().getFullYear();
    for (let i = 0; i <= 20; i++) {
      this.years.push({ name: currentYear - i, value: currentYear - i });
    }
    this.years;
  }

  visibleTimesOptions(): void {
    if (!this.viewReady()) return;
    this.toggle();
  }

  visibleAccountsOptions(): void {
    this.showAccountsOptions.set(!this.showAccountsOptions());
  }

  visibleCategoriesOptions(): void {
    this.showCategoriesOptions.set(!this.showCategoriesOptions());
  }

  onSelectType(value: string) {
    this.form.get('periodType')?.reset(); // Reset the control to clear previous selections
    this.filteredMonth = [];
    this.selectedType.set(this.selectedType() === value ? null : value);
    this.form.patchValue({ periodType: value });
    this.updateFormByPeryodType()
    this.getButtonText(); // For update button text when type changes
  }

  addPaymentIdentifierControl(): void {
    if (this.form.get('sources')) return; // Avoid duplicates
    this.form.addControl('sources', new FormControl('', [Validators.required]));
  }

  removePaymentIdentifierControl(): void {
    if (this.form?.contains('sources')) {
      this.form.removeControl('sources');
    }
  }

  updateFormByPeryodType(): void {

    switch (this.selectedType()) {
      case 'MONTHLY':
        // this.getOptions.set(this.monthOptions);
        // this.getOptions.set(this.getMonth());
        this.form.removeControl('bimonth');
        this.form.removeControl('startDate');
        this.form.removeControl('endDate');

        this.form.addControl('month', new FormControl('', [Validators.required]));
        this.form.addControl('year', new FormControl('', [Validators.required]));
        break;
      case 'BIMONTHLY':
        // this.getOptions.set(this.bimonthOptions);
        // this.getOptions.set(this.getMonth());
        this.form.removeControl('month');
        this.form.removeControl('startDate');
        this.form.removeControl('endDate');
        this.form.addControl('bimonth', new FormControl('', [Validators.required]));
        this.form.addControl('year', new FormControl('', [Validators.required]));
        break;
      case 'ANNUAL':
        this.form.removeControl('month');
        this.form.removeControl('bimonth');
        this.form.removeControl('startDate');
        this.form.removeControl('endDate');
        this.form.addControl('year', new FormControl('', [Validators.required]));
        break;
      case 'DATE_RANGE':
        this.form.removeControl('month');
        this.form.removeControl('bimonth');
        this.form.removeControl('year');
        this.form.addControl('startDate', new FormControl(null, [Validators.required]));
        this.form.addControl('endDate', new FormControl({ value: null, disabled: !(this.form.get('startDate')?.value) }, [Validators.required]));
        this.form.get('startDate')?.valueChanges.subscribe(start => {
          const endDateControl = this.form.get('endDate');

          if (start) {
            endDateControl?.enable(); // enable if startDate is selected
            endDateControl?.setValidators([Validators.required]); // ensure validation is active
          } else {
            endDateControl?.disable(); // disable if startDate is cleared
            endDateControl?.setValue(null); // optionally reset
            endDateControl?.clearValidators();
          }

          endDateControl?.updateValueAndValidity();
        });

        break;
      default:
        const controlsToRemove = ['month', 'bimonth', 'year', 'startDate', 'endDate'];
        controlsToRemove.forEach(controlName => {
          if (this.form.contains(controlName)) {
            this.form.removeControl(controlName);
          }
        });
        break;
    }
      this.form.get('year')?.reset();
  }

  onFilterButtonClicked() {
    const data = this.form.value;
    this.filterData.set(data);
    this.applyFilters.emit(this.filterData());
  }

  /** Reset the form completely */
  clear() {
    this.form.reset();
    this.selectedType.set(""); // Reset the checkbox
    console.log("🚀 ~ FilterPanelComponent ~ clear ~ this.form.value:", this.form.value);
    this.getButtonText(); // Reset button text
  }

  onSelectedYear(): void {
    this.filteredMonth = [];
    this.updateMonthOptions();
    this.form.patchValue({ month: null, bimonth: null });
    this.getButtonText();
  }

  getButtonText(): void {
    const periodType = this.form.get('periodType')?.value;
    const year = this.form.get('year')?.value;
    const month = this.form.get('month')?.value;
    const bimonth = this.form.get('bimonth')?.value;
    const startDate = this.form.get('startDate')?.value;
    const endDate = this.form.get('endDate')?.value;

    let from: string | null = null;
    let to: string | null = null;

    if (!year && !month && !bimonth && !startDate && !endDate) {
      this.buttonText.set('בחר');
      return; // No selection → reset button text
    }

    if (periodType === 'MONTHLY' && month && year) {
      const first = new Date(year, month - 1, 1);
      const last = new Date(year, month, 0); // last day of month
      from = this.formatShortDate(first);
      to = this.formatShortDate(last);
      if (!this.viewReady()) return;
      this.toggle();
    }
    else if (periodType === 'BIMONTHLY' && bimonth && year) {
      const startMonth = parseInt(bimonth);
      const first = new Date(year, startMonth - 1, 1);
      const last = new Date(year, startMonth + 1, 0); // end of second month
      from = this.formatShortDate(first);
      to = this.formatShortDate(last);
      if (!this.viewReady()) return;
      this.toggle();
    }
    else if (periodType === 'ANNUAL' && year) {
      const first = new Date(year, 0, 1);
      const last = new Date(year, 11, 31);
      from = this.formatShortDate(first);
      to = this.formatShortDate(last);
      if (!this.viewReady()) return;
      this.toggle();
    }
    else if (periodType === 'DATE_RANGE') {
      if (startDate) from = this.formatShortDate(new Date(startDate));
      if (endDate) to = this.formatShortDate(new Date(endDate));
      if (startDate && endDate) {
        if (!this.viewReady()) return;
        this.toggle();
      }
    }

    if (from && to) {
      this.buttonText.set(`${from}-${to}`);
    }  
    else {
      this.buttonText.set('בחר');
    }
  }

  onChangeSelection(event: any, key: string): void {
    this.validateSubmitButton(key);
    if (key === 'account') {
      if (this.form.get('account')?.value.length === 1 && this.form.get('account')?.value[0].value !== 'notBelong') {
        this.getSourcesByBillId(event[0].value);
        this.addPaymentIdentifierControl();
      }
      else {
        this.removePaymentIdentifierControl();
      }
    }
  }

  getSourcesByBillId(billId: number): void {
    this.transactionService.getSourcesByBillId(billId).pipe(
      catchError((err) => {
        console.log('err in get sources by billId: ', err);
        return EMPTY;
      }),
      map((data: string[]) =>
        data.map(item => ({ name: item, value: item }))

      )
    ).subscribe((res) => {
      this.sourcesList.set(res);
    })

  }

  validateSubmitButton(key: string): void {
    const val = this.form.get(key).value.length;
    switch (key) {
      case 'category':
        this.isCategoryEmpty.set(!val);
        break;
      case 'account':
        this.isAccountEmpty.set(!val);
        break;
      default:
        break;
    }
  }

  private formatShortDate(date: Date): string {
    const d = new Date(date);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear() % 100; // last 2 digits
    return `${day}/${month}/${year}`;
  }


  // get tooltipText(): string {
  //   return this.selectedValues.length
  //     ? this.selectedValues.map(o => o.label).join(', ')
  //     : 'No selection';
  // }


}
