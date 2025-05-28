import { ChangeDetectionStrategy, Component, OnInit, input, computed, signal, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputSelectComponent } from '../input-select/input-select.component';
import { ISelectItem, IUserData } from 'src/app/shared/interface';
import { DatePickerModule } from 'primeng/datepicker';
import { BusinessMode, BusinessType, doubleMonthsList, inputsSize, reportingVatPeriodTypeOptionsList, singleMonthsList } from 'src/app/shared/enums';
import { ButtonComponent } from "../button/button.component";
import { ButtonSize } from '../button/button.enum';
import { ButtonColor } from '../button/button.enum';

@Component({
  selector: 'app-period-select',
  templateUrl: './period-select.component.html',
  styleUrls: ['./period-select.component.scss'],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, InputSelectComponent, DatePickerModule, ButtonComponent],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodSelectComponent implements OnInit {

  form: FormGroup = this.fb.group({});
  parentPage = input<string>("");
  businessMode = input<BusinessMode>(BusinessMode.ONE_BUSINESS);
  businessNumber = input<string | null>(null);
  businessOptions = input<ISelectItem[]>([]);
  periodType = signal<string>("");
  @Output() formSubmit = new EventEmitter<Record<string, any>>();

  // Expose the BusinessMode enum to the template
  BusinessMode = BusinessMode;

  monthList = computed(() => {
    if (this.periodType() === 'BIMONTHLY') {
      return doubleMonthsList;
    }
    return singleMonthsList;
  });

  // Order of fields for each form type
  fieldsOrder: { [key: string]: string[] } = {
    vatReport: ['periodType', 'year', 'month', 'businessNumber'],
    pnlReport: ['periodType', 'year', 'month', 'businessNumber'],
    uniformFile: ['startDate', 'endDate'],
  };

  labels: { [key: string]: string } = {
    periodType: 'תקופת דיווח',
    year: 'שנה',
    month: 'חודש',
    businessNumber: 'מספר עוסק',
  };

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  inputsSize = inputsSize;

  constructor(private fb: FormBuilder) {}


  ngOnInit(): void {

    this.initializeForm();

    // Watch for changes in the periodType control
    const periodTypeControl = this.form.get('periodType');
    if (periodTypeControl) {
      periodTypeControl.valueChanges.subscribe(value => {
        console.log("Period type changed to:", value);
        this.periodType.set(value);
      });
    }

  }


  onSubmit(): void {
    this.formSubmit.emit(this.form.value);
  }


  initializeForm() {
    switch (this.parentPage()) {
      case 'vatReport':
        this.form = this.fb.group({
          periodType: ['', Validators.required],
          year: ['', Validators.required],
          month: ['', Validators.required],
          businessNumber: ['', Validators.required],
        });
        // Set the default businessNumber if only one business is available
        if (this.businessMode() === BusinessMode.ONE_BUSINESS && this.businessOptions()[0]) {
          this.form.get('businessNumber')?.setValue(this.businessOptions()[0].value);
        } 
        break;
      case 'pnlReport':
        this.form = this.fb.group({
          periodType: ['', Validators.required],
          year: ['', Validators.required],
          month: ['', Validators.required],
          businessNumber: ['', Validators.required],
          //orderDate: [new Date(), Validators.required],
        });
        break;
      case 'uniformFile':
        this.form = this.fb.group({
          startDate: ['', Validators.required],
          endDate: [new Date(), Validators.required],
        });
        break;
      default:
        this.form = this.fb.group({});
    }
  }


  getItems(list: string) {
    switch (list) {
      case 'periodType':
        return reportingVatPeriodTypeOptionsList;
      case 'year':
        return this.generateYears();
      case 'month':
        return this.monthList();
      case 'businessNumber':
        return this.businessOptions();
      default:
        return [];
    }
  }


  generateYears(): ISelectItem[] {
    const currentYear = new Date().getFullYear();
    let years: ISelectItem[] = [];
    for (let i = 0; i <= 20; i++) {
      years.push({ name: currentYear - i, value: currentYear - i });
    }
    return years;
  }


  getPlaceholder(key: string): string {
    return this.labels[key] || key;
  }


  // Return the ordered list of field keys
  getOrderedFields(): string[] {

    const baseFields = this.fieldsOrder[this.parentPage()] || Object.keys(this.form.controls);

    // Exclude businessNumber if the mode is ONE_BUSINESS
    if (this.businessMode() === BusinessMode.ONE_BUSINESS) {
      return baseFields.filter(field => field !== 'businessNumber');
    }

    return baseFields;
  }


}

