import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';
import { MessageService } from 'primeng/api';
import * as XLSX from 'xlsx';

import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
import { FilesService } from 'src/app/services/files.service';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { BusinessStatus, inputsSize } from 'src/app/shared/enums';
import { IUserData } from 'src/app/shared/interface';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';

import { DepreciationReportService, IForm1342Report } from './depreciation-report.service';

@Component({
  selector: 'app-depreciation-report',
  templateUrl: './depreciation-report.page.html',
  styleUrls: ['./depreciation-report.page.scss', '../../shared/shared-styling.scss'],
  standalone: false
})
export class DepreciationReportPage implements OnInit {

  private fb = inject(FormBuilder);
  private gs = inject(GenericService);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private depreciationService = inject(DepreciationReportService);
  private messageService = inject(MessageService);
  private filesService = inject(FilesService);

  readonly ButtonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  readonly inputSize = inputsSize;

  /** Column headers in DOM order. In RTL the first column ends up rightmost. */
  readonly columnHeaders: { num: number; title: string }[] = [
    { num: 1,  title: 'שם הנכס ותיאורו' },
    { num: 2,  title: 'תאריך הרכישה / השינוי' },
    { num: 3,  title: 'תאריך הפעלת הנכס' },
    { num: 4,  title: 'מחיר עלות / מחיר רכישה מקורי' },
    { num: 5,  title: 'שינויים במשך השנה' },
    { num: 6,  title: 'סה"כ מחיר נכסים בני פחת' },
    { num: 7,  title: 'שיעור הפחת הקבוע עפ"י דין' },
    { num: 8,  title: 'פחת שנדרש לשנה השוטפת' },
    { num: 9,  title: 'סה"כ פחת שנצבר משנים קודמות' },
    { num: 10, title: 'סה"כ פחת' },
    { num: 11, title: 'יתרה מופחתת' },
  ];

  userData: IUserData;
  BusinessStatus = BusinessStatus;
  businessStatus: BusinessStatus = BusinessStatus.SINGLE_BUSINESS;

  form: FormGroup = this.fb.group({});
  filterConfig: FilterField[] = [];

  businessNumber = signal<string>('');
  selectedYear = signal<number>(new Date().getFullYear());

  isLoading = signal<boolean>(false);
  isRequestSent = signal<boolean>(false);
  report = signal<IForm1342Report | null>(null);

  ngOnInit(): void {
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.businessStatus = this.userData.businessStatus;
    const businesses = this.gs.businesses();
    if (businesses.length > 0) {
      this.businessNumber.set(businesses[0].businessNumber);
    }

    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: 15 }, (_, i) => {
      const y = currentYear - i;
      return { value: String(y), name: String(y) };
    });

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
        type: 'select',
        controlName: 'year',
        label: 'שנת מס',
        required: true,
        options: yearOptions,
        defaultValue: String(currentYear),
      },
    ];

    // Reset displayed report when filters change so a stale table can't be
    // mistaken for a refreshed one before the user clicks "הצג".
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.report.set(null);
        this.isRequestSent.set(false);
      });
  }

  onSubmit(formValues: any): void {
    const effectiveBusiness = this.gs.getEffectiveBusinessNumber(
      this.form, formValues.businessNumber, this.userData
    );
    const year = Number(formValues.year) || new Date().getFullYear();

    this.businessNumber.set(effectiveBusiness);
    this.selectedYear.set(year);
    this.isRequestSent.set(true);
    this.fetchReport();
  }

  private fetchReport(): void {
    this.isLoading.set(true);
    this.depreciationService.getDepreciationReport(this.businessNumber(), this.selectedYear())
      .pipe(
        catchError((err) => {
          console.error('Depreciation report fetch failed:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'טעינת דוח הפחת נכשלה, נא לנסות שוב',
            life: 5000,
            key: 'br',
          });
          this.report.set(null);
          return EMPTY;
        }),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe((data) => this.report.set(data));
  }

  /** Format a number with thousands separators and two decimals. */
  formatAmount(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
    return Number(value).toLocaleString('he-IL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /** Format depreciation rate as a percent string. */
  formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
    return `${Number(value).toFixed(2)}%`;
  }

  /** Format ISO yyyy-mm-dd date as dd/mm/yyyy for display. */
  formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }

  /**
   * Export the report as an .xlsx file. Sheet is built RTL with one header
   * row, one row per asset, and a totals row at the bottom.
   */
  exportToExcel(): void {
    const data = this.report();
    if (!data || !data.rows.length) return;

    const header = this.columnHeaders.map(c => `${c.num}. ${c.title}`);

    const rows = data.rows.map(r => [
      r.assetName,
      this.formatDate(r.purchaseDate),
      this.formatDate(r.activationDate),
      r.originalCost,
      r.changesDuringYear,
      r.depreciableCost,
      r.depreciationRatePerLaw,
      r.currentYearDepreciation,
      r.priorYearsDepreciation,
      r.totalDepreciation,
      r.remainingBalance,
    ]);

    const totalsRow = [
      'סה"כ',
      '',
      '',
      data.totalOriginalCost,
      data.totalChangesDuringYear,
      data.totalDepreciableCost,
      '',
      data.totalCurrentYearDepreciation,
      data.totalPriorYearsDepreciation,
      data.totalDepreciation,
      data.totalRemainingBalance,
    ];

    const sheetData: (string | number)[][] = [header, ...rows, totalsRow];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    (ws as any)['!dir'] = 'rtl';

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `דוח פחת ${data.year}`);

    const business = this.gs.businesses().find(b => b.businessNumber === this.businessNumber());
    const businessName = business?.businessName ?? this.userData?.businessName ?? this.businessNumber();
    XLSX.writeFile(wb, `depreciation-report_${businessName}_${data.year}.xlsx`);
  }

  /** Download the server-rendered PDF so browser headers, dates and URLs cannot leak into it. */
  exportToPdf(): void {
    const data = this.report();
    if (!data) return;

    const business = this.gs.businesses().find(b => b.businessNumber === this.businessNumber());
    const businessName = business?.businessName ?? this.userData?.businessName ?? '';
    this.depreciationService.generateDepreciationReportPdf(this.businessNumber(), data.year)
      .pipe(
        catchError((err) => {
          console.error('Depreciation report PDF generation failed:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'יצירת קובץ ה-PDF נכשלה. אנא נסה שוב.',
            life: 5000,
            key: 'br',
          });
          return EMPTY;
        }),
      )
      .subscribe((blob) => {
        this.filesService.downloadFile(`דוח פחת - ${businessName} - ${data.year}.pdf`, blob);
      });
  }
}
