import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';
import { MessageService } from 'primeng/api';
import * as XLSX from 'xlsx';

import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
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

  readonly ButtonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  readonly inputSize = inputsSize;
  readonly PDF_FOOTER_TEXT = 'Created by KeepInTax LTD | תוכנה מאושרת על ידי רשות המיסים';

  /** Column headers in DOM order. In RTL the first column ends up rightmost. */
  readonly columnHeaders: { num: number; title: string }[] = [
    { num: 1,  title: 'שם הנכס ותיאורו' },
    { num: 2,  title: 'תאריך הרכישה / השינוי' },
    { num: 3,  title: 'תאריך הפעלת הנכס' },
    { num: 4,  title: 'מחיר עלות / מחיר רכישה מקורי' },
    { num: 5,  title: 'שינויים במשך השנה' },
    { num: 6,  title: 'אחוז פחת' },
    { num: 7,  title: 'אחוז פחת לפי חוק' },
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
      r.depreciationRate,
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
      0,
      '',
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
    XLSX.utils.book_append_sheet(wb, ws, `טופס 1342 ${data.year}`);

    const business = this.gs.businesses().find(b => b.businessNumber === this.businessNumber());
    const businessName = business?.businessName ?? this.userData?.businessName ?? this.businessNumber();
    XLSX.writeFile(wb, `depreciation-report_${businessName}_${data.year}.xlsx`);
  }

  /**
   * Print-to-PDF flow. Builds a self-contained HTML document in a hidden
   * iframe and triggers window.print() — same pattern as vat-report so the
   * KeepInTax footer requirement is honored without a new PDF dependency.
   */
  exportToPdf(): void {
    const data = this.report();
    if (!data) return;

    const business = this.gs.businesses().find(b => b.businessNumber === this.businessNumber());
    const businessName = business?.businessName ?? this.userData?.businessName ?? '';
    const businessAddress = business?.businessAddress ?? this.userData?.businessAddress ?? '';
    const businessNum = this.businessNumber();

    const headerHtml = this.columnHeaders
      .map(c => `<th>${this.escapeHtml(`${c.num}. ${c.title}`)}</th>`)
      .join('');

    const rowsHtml = data.rows.map(r => `
      <tr>
        <td>${this.escapeHtml(r.assetName)}</td>
        <td>${this.escapeHtml(this.formatDate(r.purchaseDate))}</td>
        <td>${this.escapeHtml(this.formatDate(r.activationDate))}</td>
        <td dir="ltr">${this.escapeHtml(this.formatAmount(r.originalCost))}</td>
        <td dir="ltr">${this.escapeHtml(this.formatAmount(r.changesDuringYear))}</td>
        <td dir="ltr">${this.escapeHtml(this.formatPercent(r.depreciationRate))}</td>
        <td dir="ltr">${this.escapeHtml(this.formatPercent(r.depreciationRatePerLaw))}</td>
        <td dir="ltr">${this.escapeHtml(this.formatAmount(r.currentYearDepreciation))}</td>
        <td dir="ltr">${this.escapeHtml(this.formatAmount(r.priorYearsDepreciation))}</td>
        <td dir="ltr">${this.escapeHtml(this.formatAmount(r.totalDepreciation))}</td>
        <td dir="ltr">${this.escapeHtml(this.formatAmount(r.remainingBalance))}</td>
      </tr>
    `).join('');

    const totalsHtml = `
      <tr class="totals-row">
        <td><strong>סה"כ</strong></td>
        <td></td>
        <td></td>
        <td dir="ltr"><strong>${this.escapeHtml(this.formatAmount(data.totalOriginalCost))}</strong></td>
        <td dir="ltr">0.00</td>
        <td></td>
        <td></td>
        <td dir="ltr"><strong>${this.escapeHtml(this.formatAmount(data.totalCurrentYearDepreciation))}</strong></td>
        <td dir="ltr"><strong>${this.escapeHtml(this.formatAmount(data.totalPriorYearsDepreciation))}</strong></td>
        <td dir="ltr"><strong>${this.escapeHtml(this.formatAmount(data.totalDepreciation))}</strong></td>
        <td dir="ltr"><strong>${this.escapeHtml(this.formatAmount(data.totalRemainingBalance))}</strong></td>
      </tr>
    `;

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>דוח פחת - טופס 1342 - ${this.escapeHtml(businessName)} - ${data.year}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; }
    body { font-family: Arial, "Segoe UI", sans-serif; padding: 24px 24px 64px; color: #222; }
    h1 { font-size: 22px; margin: 0 0 16px; text-align: center; }
    .section { margin-bottom: 22px; }
    .section h2 { font-size: 16px; margin: 0 0 10px; border-bottom: 2px solid #444; padding-bottom: 4px; }
    .business-info p { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: auto; }
    th, td { border: 1px solid #ddd; padding: 5px 6px; text-align: right; vertical-align: top; }
    th { background: #f4f4f4; font-weight: 700; }
    .totals-row td { background: #fafafa; }
    .pdf-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 8px 16px;
      font-size: 11px;
      color: #555;
      text-align: center;
      border-top: 1px solid #ddd;
      background: #fff;
    }
    @media print {
      body { padding: 24px 24px 64px; }
      .pdf-footer { position: fixed; bottom: 0; }
      @page { size: A4 landscape; }
    }
  </style>
</head>
<body>
  <h1>דוח פחת — טופס 1342</h1>

  <div class="section business-info">
    <h2>פרטי העסק</h2>
    <p><strong>שם העסק:</strong> ${this.escapeHtml(businessName)}</p>
    <p><strong>מספר עוסק:</strong> ${this.escapeHtml(businessNum)}</p>
    ${businessAddress ? `<p><strong>כתובת:</strong> ${this.escapeHtml(businessAddress)}</p>` : ''}
    <p><strong>שנת מס:</strong> ${data.year}</p>
  </div>

  <div class="section">
    <h2>פירוט נכסים</h2>
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>
        ${rowsHtml}
        ${totalsHtml}
      </tbody>
    </table>
  </div>

  <div class="pdf-footer">${this.escapeHtml(this.PDF_FOOTER_TEXT)}</div>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      cleanup();
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'יצירת קובץ ה-PDF נכשלה. אנא נסה שוב.',
        life: 5000,
        key: 'br',
      });
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      const win = iframe.contentWindow;
      if (!win) { cleanup(); return; }
      win.focus();
      win.onafterprint = () => setTimeout(cleanup, 0);
      win.print();
      setTimeout(cleanup, 60000);
    }, 250);
  }

  private escapeHtml(value: string | number | null | undefined): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return c;
      }
    });
  }
}
