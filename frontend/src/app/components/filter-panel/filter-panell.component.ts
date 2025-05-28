import { Component, effect, ElementRef, inject, Injector, input, OnInit, output, runInInjectionContext, signal, ViewChild } from '@angular/core';
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
export class FilterPanelComponent implements OnInit {
  private readonly injector = inject(Injector);
  private dateService = inject(DateService);

  @ViewChild('menu') menu?: ElementRef<HTMLDivElement>;
  @ViewChild('content') content?: ElementRef<HTMLDivElement>;
  
  private lastContentHeight = 0;

  isOpen = false;
  readonly EXTRA = 50;
  private ro!: ResizeObserver;

  // Inputs & Outputs as Signals
  readonly accountOptions = input<SelectOption[]>([]);
  readonly categoryOptions = input<SelectOption[]>([]);
  isVisible = input<boolean>(false);
  readonly applyFilters = output<any>();
  readonly clearFilters = output<void>();
  showTimeOptions = signal(false);
  showAccountsOptions = signal(false);
  showCategoriesOptions = signal(false);
  getOptions = signal<ISelectItem[]>([]);
  categoryList = signal<ISelectItem[]>([]);
  buttonText = signal<string>('aaa');
  viewReady = signal(false);


  form: FormGroup
  private transactionService = inject(TransactionsService);
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
    { name: 'ינואר-פברואר', value: '1' },
    { name: 'מרץ-אפריל', value: '3' },
    { name: 'מאי-יוני', value: '5' },
    { name: 'יולי-אוגוסט', value: '7' },
    { name: 'ספטמבר-אוקטובר', value: '9' },
    { name: 'נובמבר-דצמבר', value: '11' }
  ];

  years: ISelectItem[] = [];


  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  inputsSize = inputsSize;
  iconPos = iconPosition;

  accountsList = signal<ISelectItem[]>([]);
  filterData = signal<any>(null);
  selected: any[] = [];
  selectedType = signal<string>("");



  constructor() {
    this.form = this.fb.group({
      periodType: new FormControl(
        '', [Validators.required]
      ),
      account: new FormControl(
        [], [Validators.required]
      ),
      category: new FormControl(
        [], [Validators.required]
      ),
    });

    runInInjectionContext(this.injector, () => {
      effect(() => {
        if (!this.isVisible()) {
          return; // panel is hidden → skip
        }
  
        queueMicrotask(() => {
          // Let Angular finish rendering *ngIf block
          const contentEl = this.content?.nativeElement;
          const menuEl = this.menu?.nativeElement;
  
          if (!contentEl || !menuEl) return; // still not rendered → try on next signal change
  
          if (!this.ro) {
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
          }
        });
      });
    });
  }

  ngOnInit(): void {
    this.getButtonText();
    this.generateYears();
    this.getCategories();
    this.accountsList = this.transactionService.accountsList;
    this.filterData = this.transactionService.filterData;
    this.categoryList = this.transactionService.categories;
  }
  

  ngOnDestroy() {
    this.ro?.disconnect();
  }

  toggle() {
    if (this.isOpen) {
      // close immediately
      this.menu.nativeElement.style.height = '0';
    } else {
      // open: use the last measured content height
      const h = this.lastContentHeight || this.content.nativeElement.scrollHeight;
      this.menu.nativeElement.style.height = `${h + this.EXTRA}px`;
    }
    this.isOpen = !this.isOpen;
  }

  getCategories(): void {
    this.transactionService.getCategories(null, true)
      .subscribe((res) => {
        // console.log("category", res);
      })
  }

  onSelectCategory(): void {
    // console.log("form: ", this.form.value);
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
    this.toggle();
  }

  visibleAccountsOptions(): void {
    this.showAccountsOptions.set(!this.showAccountsOptions());
  }

  visibleCategoriesOptions(): void {
    this.showCategoriesOptions.set(!this.showCategoriesOptions());
  }

  onSelectType(value: string) {
    this.selectedType.set(this.selectedType() === value ? null : value);
    this.form.patchValue({ periodType: value });
    // console.log("🚀 ~ FilterPanelComponent ~ onSelectType ~ this.form:", this.form)
    this.updateFormByPeryodType()
  }

  updateFormByPeryodType(): void {

    switch (this.selectedType()) {
      case 'MONTHLY':
        this.getOptions.set(this.monthOptions);
        this.form.removeControl('bimonth');
        this.form.removeControl('startDate');
        this.form.removeControl('endDate');

        this.form.addControl('month', new FormControl('', [Validators.required]));
        this.form.addControl('year', new FormControl('', [Validators.required]));
        break;
      case 'BIMONTHLY':
        this.getOptions.set(this.bimonthOptions);
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
        this.form.addControl('endDate', new FormControl(null, [Validators.required]));
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
  }

  /** Emit current filters */
  onFilterButtonClicked() {
    const data = this.form.value;
    this.filterData.set(data);
    //console.log(this.transactionService.filterData());
    
    // console.log("form data:", data);
    
    this.applyFilters.emit(this.filterData());
  }

  /** Reset the form completely */
  clear() {
    this.form.reset();
    this.selectedType.set(""); // Reset the checkbox
    console.log("🚀 ~ FilterPanelComponent ~ clear ~ this.form.value:", this.form.value);

  }

  // getButtonText(): void {
  //   console.log("in getButtonText");
    
  //   let month = "";
  //   let bimonth = "";
  //   let year = "";
  //   let startDate = "";
  //   let endDate = "";
   
  //   if (month || bimonth || year || startDate || endDate) {
  //     console.log("in if");
      
  //     this.buttonText.set(`${month}, ${bimonth}, ${year}, ${startDate}, ${endDate}`);
  //   }
  //   else {
  //     this.buttonText.set('בחר')
  //   }
  // }

  getButtonText(): void {
    const parts: string[] = [];
  
    const month = this.form.get('month')?.value;
    const bimonth = this.form.get('bimonth')?.value;
    const year = this.form.get('year')?.value;
    const startDate = this.form.get('startDate')?.value;
    const endDate = this.form.get('endDate')?.value;
  
    if (month) parts.push(month);
    if (bimonth) parts.push(bimonth);
    if (year) parts.push(year);
    if (startDate) parts.push(this.dateService.formatDate(startDate));
    if (endDate) parts.push(this.dateService.formatDate(endDate));
  
    if (parts.length > 0) {
      this.buttonText.set(parts.join(', '));
    } else {
      this.buttonText.set('בחר');
    }
  }
  

  // get tooltipText(): string {
  //   return this.selectedValues.length
  //     ? this.selectedValues.map(o => o.label).join(', ')
  //     : 'No selection';
  // }


}
