import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AdvanceIncomeTaxReportService } from './advance-income-tax-report.service';
import { GenericService } from 'src/app/services/generic.service';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';
import { ReportingPeriodType } from 'src/app/shared/enums';
import { IUserData } from 'src/app/shared/interface';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { EMPTY, finalize, map, catchError } from 'rxjs';
import { signal } from '@angular/core';
import { inputsSize } from 'src/app/shared/enums';
import { IAdvanceIncomeTaxReportData } from 'src/app/shared/interface';

@Component({
  selector: 'app-advance-income-tax-report',
  templateUrl: './advance-income-tax-report.page.html',
  styleUrls: ['./advance-income-tax-report.page.scss', '../../shared/shared-styling.scss'],
  standalone: false
})
export class AdvanceIncomeTaxReportPage implements OnInit {

  private gs = inject(GenericService);
  private fb = inject(FormBuilder);

  form: FormGroup = this.fb.group({});
  filterConfig: FilterField[] = [];
  startDate = signal<string>('');
  endDate = signal<string>('');
  businessNumber = signal<string>('');

  reportData = signal<IAdvanceIncomeTaxReportData | null>(null);
  isLoading = signal<boolean>(false);
  userData: IUserData;

  readonly inputSize = inputsSize;

  /** עוסק מורשה/חברה: עסקאות חייבות, עסקאות פטורות, מע"מ, סה"כ הכנסות, אחוז, מקדמות, ניכוי, לתשלום */
  private reportOrderLicensed: string[] = [
    'vatableTurnover',
    'nonVatableTurnover',
    'vatOnTurnover',
    'totalIncome',
    'advanceTaxPercent',
    'totalAdvanceTax',
    'taxWithholdingAtSource',
    'totalToPay'
  ];

  /** עוסק פטור: רק סך עסקאות, אחוז, מקדמות, ניכוי, לתשלום */
  private reportOrderExempt: string[] = [
    'totalIncome',
    'advanceTaxPercent',
    'totalAdvanceTax',
    'taxWithholdingAtSource',
    'totalToPay'
  ];

  private reportFieldTitlesBase: Record<string, string> = {
    vatableTurnover: 'עסקאות חייבות',
    nonVatableTurnover: 'עסקאות פטורות או בשיעור אפס',
    vatOnTurnover: 'מע"מ עסקאות',
    totalIncome: 'סה"כ הכנסות',
    totalIncomeExempt: 'סך עסקאות',
    advanceTaxPercent: 'אחוז מקדמות מס',
    totalAdvanceTax: 'סה"כ מקדמות מס',
    taxWithholdingAtSource: 'ניכוי מס במקור',
    totalToPay: 'סה"כ לתשלום'
  };

  get reportOrder(): string[] {
    const data = this.reportData();
    return data?.businessType === 'EXEMPT' ? this.reportOrderExempt : this.reportOrderLicensed;
  }

  get reportFieldTitles(): Record<string, string> {
    const data = this.reportData();
    const titles = { ...this.reportFieldTitlesBase };
    if (data?.businessType === 'EXEMPT') {
      titles['totalIncome'] = this.reportFieldTitlesBase['totalIncomeExempt'];
    }
    return titles;
  }

  constructor(
    private dateService: DateService,
    public advanceIncomeTaxReportService: AdvanceIncomeTaxReportService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.userData = this.authService.getUserDataFromLocalStorage();
    const businesses = this.gs.businesses();
    this.businessNumber.set(businesses[0]?.businessNumber ?? '');

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const defaultPeriodMode = ReportingPeriodType.BIMONTHLY;
    const defaultMonthValue = this.gs.getDefaultMonthValue(currentMonth, defaultPeriodMode);

    this.filterConfig = [
      {
        type: 'select',
        controlName: 'businessNumber',
        label: 'בחר עסק',
        required: true,
        options: this.gs.businessSelectItems,
        defaultValue: this.businessNumber(),
      },
      {
        type: 'period',
        controlName: 'period',
        required: true,
        allowedPeriodModes: [ReportingPeriodType.MONTHLY, ReportingPeriodType.BIMONTHLY],
        periodDefaults: {
          periodMode: ReportingPeriodType.BIMONTHLY,
          year: currentYear,
          month: defaultMonthValue
        }
      },
    ];
  }

  onSubmit(formValues: unknown): void {
    const periodMode = this.form.get('periodMode')?.value;
    const year = this.form.get('year')?.value;
    const month = this.form.get('month')?.value;
    const localStartDate = this.form.get('startDate')?.value;
    const localEndDate = this.form.get('endDate')?.value;

    const { startDate, endDate } = this.dateService.getStartAndEndDates(
      periodMode,
      year,
      month,
      localStartDate,
      localEndDate
    );

    this.businessNumber.set(this.form?.get('businessNumber')?.value);
    this.startDate.set(startDate);
    this.endDate.set(endDate);
    this.loadReportData(startDate, endDate, this.businessNumber());
  }

  loadReportData(startDate: string, endDate: string, businessNumber: string): void {
    this.isLoading.set(true);
    this.advanceIncomeTaxReportService
      .getAdvanceIncomeTaxReportData(startDate, endDate, businessNumber)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        catchError((err) => {
          console.error('advance-income-tax-report load error', err);
          return EMPTY;
        }),
        map((data) => {
          const formatted: IAdvanceIncomeTaxReportData = { ...data };
          (Object.keys(formatted) as (keyof IAdvanceIncomeTaxReportData)[]).forEach((key) => {
            const val = formatted[key];
            if (key !== 'advanceTaxPercent' && key !== 'businessType' && typeof val === 'number') {
              (formatted as any)[key] = this.gs.addComma(val);
            }
          });
          return formatted;
        })
      )
      .subscribe((res) => this.reportData.set(res));
  }
}
