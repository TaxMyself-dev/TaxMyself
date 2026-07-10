import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';
import { Workbook } from 'exceljs';
import { GenericService } from 'src/app/services/generic.service';
import { AuthService } from 'src/app/services/auth.service';
import { BusinessStatus, ReportingPeriodType } from 'src/app/shared/enums';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { ISelectItem, IUserData } from 'src/app/shared/interface';
import {
  ICreateManualJournalEntryPayload,
  IJournalEntryDetail,
  ILedgerAccountOption,
  ILedgerLine,
  ILedgerReport,
  LedgerReportService,
  ManualJournalEntryKind,
} from './ledger-report.service';

@Component({
  selector: 'app-ledger-report',
  templateUrl: './ledger-report.page.html',
  styleUrls: ['./ledger-report.page.scss', '../../shared/shared-styling.scss'],
  standalone: false
})
export class LedgerReportPage implements OnInit {

  // Services
  private gs = inject(GenericService);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);

  // Business related
  businessNumber = signal<string>("");
  businessName = signal<string>("");
  BusinessStatus = BusinessStatus;
  businessStatus: BusinessStatus = BusinessStatus.SINGLE_BUSINESS;

  // Filter related
  form: FormGroup = this.fb.group({});
  filterConfig: FilterField[] = [];
  startDate = signal<string>("");
  endDate = signal<string>("");
  /** Account-selector options. Signal so they can fill in asynchronously
   *  WITHOUT delaying filterConfig (see ngOnInit). value '' = "all accounts". */
  accountOptions = signal<ISelectItem[]>([{ name: 'כל הכרטיסים', value: '' }]);
  /** Posting accounts for the manual journal-entry modal (excludes technical
   *  accounts — loaded from /reports/ledger-entry-accounts). */
  entryAccountOptions = signal<ISelectItem[]>([]);
  /** Same list, unmapped, kept so each card can filter by account `type`
   *  (income accounts for income/income_exempt cards, expense accounts for
   *  expense cards). */
  private entryAccountOptionsRaw = signal<ILedgerAccountOption[]>([]);

  // Report data
  ledgerReport: ILedgerReport;
  /** The account filter applied to the currently-shown report (null = all). */
  selectedAccountCode = signal<string | null>(null);
  userData: IUserData;
  isRequestSent = signal<boolean>(false);

  reportingPeriodType = ReportingPeriodType;

  /** True when a single account is shown (Mode A); false = all accounts (Mode B). */
  get isSingleAccountMode(): boolean {
    return !!this.selectedAccountCode();
  }

  constructor(
    public ledgerReportService: LedgerReportService,
    public authService: AuthService,
    private genericService: GenericService,
  ) {}

  async ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.businessStatus = this.userData.businessStatus;
    const businesses = this.gs.businesses();

    if (businesses.length === 1) {
      this.businessNumber.set(businesses[0].businessNumber);
      this.businessName.set(businesses[0].businessName);
      this.form.get('businessNumber')?.setValue(businesses[0].businessNumber);
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // IMPORTANT: build filterConfig SYNCHRONOUSLY — do NOT await before this.
    // FilterTabComponent.buildForm() registers the form controls in ITS ngOnInit
    // from `config()` as it is at that moment. If we awaited (e.g. to load the
    // account list) before assigning filterConfig, the child would see an empty
    // config and never register the businessNumber/accountCode controls — so
    // switching business wouldn't emit on form.valueChanges and the report
    // wouldn't refresh (the original bug). Account options instead fill in
    // asynchronously via the `accountOptions` signal (FilterTab.resolveOptions
    // supports signal-valued options).
    this.filterConfig = [
      {
        type: 'select',
        controlName: 'businessNumber',
        label: 'בחר עסק',
        required: true,
        options: this.gs.businessSelectItems,
        defaultValue: businesses.length === 1 ? businesses[0].businessNumber : undefined
      },
      {
        type: 'select',
        controlName: 'accountCode',
        label: 'כרטיס חשבון',
        required: false,
        options: this.accountOptions,
        defaultValue: '',
      },
      {
        type: 'period',
        controlName: 'period',
        required: true,
        allowedPeriodModes: [ReportingPeriodType.MONTHLY, ReportingPeriodType.BIMONTHLY, ReportingPeriodType.ANNUAL, ReportingPeriodType.DATE_RANGE],
        periodDefaults: this.gs.getDefaultPeriodConfig({ periodMode: ReportingPeriodType.ANNUAL, year: currentYear })
      },
    ];

    // Clear a previously-rendered report when ANY filter changes (business,
    // account, or period) so a stale report is never shown for a different
    // selection — the user must press "הצג" again. Also keeps
    // businessNumber()/businessName() in sync with the filter's business
    // select as soon as it's picked, not only on submit — subscribing
    // directly to form.get('businessNumber').valueChanges from THIS ngOnInit
    // doesn't work because that control doesn't exist yet (FilterTabComponent
    // adds it later, in its own ngOnInit); the group-level valueChanges
    // observable exists from the start and still fires once the control is
    // added under it.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.ledgerReport = undefined;
        this.isRequestSent.set(false);

        const selectedBusinessNumber = this.form.get('businessNumber')?.value;
        if (selectedBusinessNumber && selectedBusinessNumber !== this.businessNumber()) {
          const business = this.gs.businesses().find(b => b.businessNumber === selectedBusinessNumber);
          if (business) {
            this.businessNumber.set(business.businessNumber);
            this.businessName.set(business.businessName);
          }
        }
      });

    // Load the account-selector options asynchronously into the signal used in
    // filterConfig above. This does NOT delay control registration.
    this.ledgerReportService.getLedgerAccounts()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => EMPTY),
      )
      .subscribe((accounts) => {
        this.accountOptions.set([
          { name: 'כל הכרטיסים', value: '' },
          ...(accounts ?? []).map((a) => ({ name: `${a.code} - ${a.name}`, value: a.code })),
        ]);
      });

    // Posting accounts for the manual journal-entry modal (no "all" option;
    // technical accounts already excluded server-side).
    this.ledgerReportService.getLedgerEntryAccounts()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => EMPTY),
      )
      .subscribe((accounts) => {
        this.entryAccountOptionsRaw.set(accounts ?? []);
        this.entryAccountOptions.set(
          (accounts ?? []).map((a) => ({ name: `${a.code} - ${a.name}`, value: a.code })),
        );
      });
  }

  onSubmit(formValues: any): void {
    const effectiveBusiness = this.gs.getEffectiveBusinessNumber(this.form, formValues.businessNumber, this.userData);
    const { startDate, endDate } = this.gs.getPeriodDatesFromForm(this.form);
    const accountCode: string | null = this.form.get('accountCode')?.value ?? null;

    this.businessNumber.set(effectiveBusiness);
    const business = this.gs.businesses().find(b => b.businessNumber === effectiveBusiness);
    if (business) {
      this.businessName.set(business.businessName);
    }

    this.startDate.set(startDate);
    this.endDate.set(endDate);
    this.isRequestSent.set(true);

    this.getLedgerReportData(startDate, endDate, effectiveBusiness, accountCode);
  }

  getLedgerReportData(startDate: string, endDate: string, businessNumber: string, accountCode: string | null): void {
    this.genericService.getLoader().subscribe();
    this.ledgerReportService.getLedgerReportData(startDate, endDate, businessNumber, accountCode)
      .pipe(
        finalize(() => this.genericService.dismissLoader()),
        catchError((err) => {
          console.log("err in get ledger report data: ", err);
          return EMPTY;
        }),
      )
      .subscribe((data: ILedgerReport) => {
        this.ledgerReport = data ?? { accounts: [] };
        this.selectedAccountCode.set(accountCode);
      });
  }

  formatReportDate(dateStr: string): string {
    if (!dateStr) return '';
    return String(dateStr).replace(/[\/-]/g, '.');
  }

  /** Hebrew label for a journal referenceType (סוג מסמך). Unknown/empty values
   *  pass through unchanged. */
  private static readonly DOC_TYPE_HEBREW: Record<string, string> = {
    TAX_INVOICE: 'חשבונית מס',
    TAX_INVOICE_RECEIPT: 'חשבונית מס קבלה',
    RECEIPT: 'קבלה',
    CREDIT_INVOICE: 'חשבונית זיכוי',
    EXPENSE: 'הוצאה',
  };

  getDocTypeHebrew(type: string): string {
    if (!type) return '';
    return LedgerReportPage.DOC_TYPE_HEBREW[type] ?? type;
  }

  /**
   * Export the full multi-account ledger as a PDF via a hidden-iframe print
   * (same pattern as depreciation-report.page.ts). Unlike window.print() on
   * the on-screen table — which carries a 1600px min-width and clips instead
   * of scrolling in the print dialog — this builds a dedicated, unconstrained
   * table (small font, wrapping text, landscape) so every column fits without
   * horizontal cropping.
   */
  exportToPdf(): void {
    if (!this.ledgerReport || !this.ledgerReport.accounts.length) return;

    const businessName = this.businessName() || this.userData?.businessName || '';
    const businessNum = this.businessNumber();
    const period = `${this.formatReportDate(this.startDate())} - ${this.formatReportDate(this.endDate())}`;

    const headerHtml = [
      'מספר פקודה', 'תאריך יצירה', 'תאריך ערך', 'תאריך מסמך', 'תקופת דיווח',
      'אסמכתא', 'סוג מסמך', 'ספק/לקוח', 'פירוט', 'חשבון נגדי',
      'חובה', 'זכות', 'יתרה', 'סה"כ מסמך', 'סה"כ לרווח והפסד',
      'סה"כ למע"מ', '% מוכר למס', '% מוכר למע"מ', 'מטבע', 'שע"ח',
    ].map((h) => `<th>${this.escapeHtml(h)}</th>`).join('');

    const accountsHtml = this.ledgerReport.accounts.map((account) => {
      const rowsHtml = account.lines.map((line) => `
        <tr>
          <td>${line.entryNumber}</td>
          <td>${this.escapeHtml(this.formatDateCell(line.date))}</td>
          <td>${this.escapeHtml(this.formatDateCell(line.valueDate))}</td>
          <td>${this.escapeHtml(this.formatDateCell(line.vatDate))}</td>
          <td>${this.escapeHtml(line.vatReportingPeriod)}</td>
          <td>${line.referenceId ?? ''}</td>
          <td>${this.escapeHtml(line.movementType)}</td>
          <td>${this.escapeHtml(line.counterPartyName || '')}</td>
          <td>${this.escapeHtml(line.description)}</td>
          <td>${this.escapeHtml(line.counterAccounts || '')}</td>
          <td dir="ltr">${line.debit.toFixed(2)}</td>
          <td dir="ltr">${line.credit.toFixed(2)}</td>
          <td dir="ltr"><strong>${line.periodBalance.toFixed(2)}</strong></td>
          <td dir="ltr">${line.documentTotal != null ? line.documentTotal.toFixed(2) : ''}</td>
          <td dir="ltr">${line.amountForTax.toFixed(2)}</td>
          <td dir="ltr">${line.vatAmount.toFixed(2)}</td>
          <td>${line.taxPercent}%</td>
          <td>${line.vatPercent}%</td>
          <td>${this.escapeHtml(line.currency)}</td>
          <td dir="ltr">${line.exchangeRate}</td>
        </tr>
      `).join('');

      return `
        <div class="account-section">
          <div class="account-header">כרטיס: ${this.escapeHtml(account.accountName)} - ${this.escapeHtml(account.accountCode)}</div>
          <table>
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>
              <tr class="opening-row">
                <td colspan="8"></td>
                <td><em>יתרת פתיחה</em></td>
                <td colspan="3"></td>
                <td dir="ltr"><strong>${account.openingBalance.toFixed(2)}</strong></td>
                <td colspan="7"></td>
              </tr>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="10"><strong>סה"כ לכרטיס</strong></td>
                <td dir="ltr"><strong>${account.totalDebit.toFixed(2)}</strong></td>
                <td dir="ltr"><strong>${account.totalCredit.toFixed(2)}</strong></td>
                <td dir="ltr"><strong>${(account.openingBalance + account.closingBalance).toFixed(2)}</strong></td>
                <td colspan="7"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>כרטסת - ${this.escapeHtml(businessName)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; }
    body { font-family: Arial, "Segoe UI", sans-serif; padding: 16px; color: #222; }
    h1 { font-size: 18px; margin: 0 0 4px; text-align: center; }
    .meta { text-align: center; font-size: 12px; color: #444; margin-bottom: 16px; }
    .account-section { margin-bottom: 18px; break-inside: avoid; }
    .account-header {
      background: #eef2f7; border: 1px solid #d8e0ea; border-radius: 4px;
      padding: 4px 8px; margin-bottom: 4px; font-size: 12px; font-weight: 700;
    }
    table { width: 100%; border-collapse: collapse; table-layout: auto; }
    th, td {
      border: 1px solid #ddd; padding: 3px 4px; text-align: right;
      font-size: 8px; word-break: break-word;
    }
    th { background: #f4f6f9; font-weight: 700; }
    .opening-row { background: #dde8f5; }
    .totals-row td { background: #eef2f7; }
    @media print {
      @page { size: A4 landscape; margin: 10mm; }
    }
  </style>
</head>
<body>
  <h1>כרטסת</h1>
  <div class="meta">
    ${this.escapeHtml(businessName)} &nbsp;|&nbsp; מ.ע: ${this.escapeHtml(businessNum)} &nbsp;|&nbsp; לתקופה: ${this.escapeHtml(period)}
  </div>
  ${accountsHtml}
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

  /** Format an ISO/date-like value as dd.MM.yyyy for the Excel export. */
  private formatDateCell(value: string | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
  }

  /**
   * Export the currently-shown ledger (כרטסת) as an .xlsx file: one section
   * per account, mirroring the on-screen table (header, opening balance,
   * lines, totals-per-account row highlighted). Uses `exceljs` (not `xlsx`)
   * because real cell styling (bold, fill color) and worksheet RTL require
   * write support that the `xlsx` community build doesn't have.
   */
  exportToExcel(): void {
    if (!this.ledgerReport || !this.ledgerReport.accounts.length) return;

    const header = [
      'מספר פקודה', 'תאריך יצירה', 'תאריך ערך', 'תאריך מסמך', 'תקופת דיווח',
      'אסמכתא', 'סוג מסמך', 'ספק/לקוח', 'פירוט', 'חשבון נגדי',
      'חובה', 'זכות', 'יתרה', 'סה"כ מסמך', 'סה"כ לרווח והפסד',
      'סה"כ למע"מ', '% מוכר למס', '% מוכר למע"מ', 'מטבע', 'שע"ח',
    ];

    const wb = new Workbook();
    const ws = wb.addWorksheet('כרטסת', { views: [{ rightToLeft: true }] });

    const HEADER_FILL: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } };
    // Same light-blue used on screen for the opening-balance row — reused
    // here for the account totals row per the "bold + light blue" request.
    const TOTAL_FILL: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDE8F5' } };

    for (const account of this.ledgerReport.accounts) {
      const titleRow = ws.addRow([`כרטיס: ${account.accountName} - ${account.accountCode}`]);
      titleRow.font = { bold: true };

      const headerRow = ws.addRow(header);
      headerRow.font = { bold: true };
      headerRow.fill = HEADER_FILL;

      ws.addRow([
        '', '', '', '', '', '', '', '', 'יתרת פתיחה', '',
        '', '', account.openingBalance, '', '', '', '', '', '', '',
      ]);

      for (const line of account.lines) {
        ws.addRow([
          line.entryNumber,
          this.formatDateCell(line.date),
          this.formatDateCell(line.valueDate),
          this.formatDateCell(line.vatDate),
          line.vatReportingPeriod,
          line.referenceId,
          line.movementType,
          line.counterPartyName || '',
          line.description,
          line.counterAccounts || '',
          line.debit,
          line.credit,
          line.periodBalance,
          line.documentTotal ?? '',
          line.amountForTax,
          line.vatAmount,
          line.taxPercent,
          line.vatPercent,
          line.currency,
          line.exchangeRate,
        ]);
      }

      const totalRow = ws.addRow([
        'סה"כ לכרטיס', '', '', '', '', '', '', '', '', '',
        account.totalDebit, account.totalCredit, account.openingBalance + account.closingBalance,
        '', '', '', '', '', '', '',
      ]);
      totalRow.font = { bold: true };
      totalRow.fill = TOTAL_FILL;

      ws.addRow([]);
    }

    for (let i = 1; i <= header.length; i++) {
      ws.getColumn(i).width = 14;
    }

    const businessName = this.businessName() || this.userData?.businessName || this.businessNumber();
    const period = `${this.formatReportDate(this.startDate())}-${this.formatReportDate(this.endDate())}`;
    this.downloadWorkbook(wb, `כרטסת_${businessName}_${period}.xlsx`);
  }

  /** Serialize the workbook and trigger a browser download. */
  private downloadWorkbook(wb: Workbook, filename: string): void {
    wb.xlsx.writeBuffer().then((buffer) => {
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Manual journal entry (פקודת יומן ידנית) — POST /bookkeeping/manual-journal-entries
  // A list of independent entries, submitted atomically (all-or-nothing).
  // ──────────────────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────────────────
  // Journal Entry Detail modal (view full entry when clicking a ledger row)
  // ──────────────────────────────────────────────────────────────────────────

  showEntryDetailModal = false;
  selectedEntry: IJournalEntryDetail | null = null;
  entryDetailLoading = false;

  openEntryDetail(line: ILedgerLine): void {
    if (!line.journalEntryId || !this.businessNumber()) return;
    this.entryDetailLoading = true;
    this.showEntryDetailModal = true;
    this.selectedEntry = null;
    this.ledgerReportService
      .getJournalEntryDetail(this.businessNumber(), line.journalEntryId)
      .pipe(catchError(() => EMPTY))
      .subscribe((detail) => {
        this.selectedEntry = detail;
        this.entryDetailLoading = false;
      });
  }

  closeEntryDetail(): void {
    this.showEntryDetailModal = false;
    this.selectedEntry = null;
  }

  entryKindOptions: ISelectItem[] = [
    { name: 'הכנסה (חייבת במע"מ)', value: 'income' },
    { name: 'הכנסה פטורה ממע"מ', value: 'income_exempt' },
    { name: 'הוצאה', value: 'expense' },
  ];

  vatPeriodOptions = signal<ISelectItem[]>([]);

  showJournalEntryModal = false;
  manualEntriesForm: FormArray<FormGroup> = this.fb.array([this.buildEntryCardGroup()]);

  get entryCards(): FormGroup[] {
    return this.manualEntriesForm.controls;
  }

  private buildEntryCardGroup(): FormGroup {
    return this.fb.group({
      entryKind: ['expense' as ManualJournalEntryKind],
      valueDate: [new Date()],
      reference: [''],
      accountCode: [''],
      subCategoryName: [''],
      amount: [0],
      vatPercent: [100],
      taxPercent: [100],
      isEquipment: [false],
      vatReportingPeriod: [null],
      notes: [''],
    });
  }

  openJournalEntryModal(): void {
    this.manualEntriesForm = this.fb.array([this.buildEntryCardGroup()]);
    this.showJournalEntryModal = true;
    this.loadVatReportingPeriods();
  }

  closeJournalEntryModal(): void {
    this.manualEntriesForm = this.fb.array([this.buildEntryCardGroup()]);
    this.showJournalEntryModal = false;
  }

  private loadVatReportingPeriods(): void {
    const businessNumber = this.businessNumber();
    if (!businessNumber) {
      this.vatPeriodOptions.set([]);
      return;
    }
    this.ledgerReportService.getVatReportingPeriods(businessNumber)
      .pipe(catchError(() => EMPTY))
      .subscribe((periods) => {
        this.vatPeriodOptions.set((periods ?? []).map((p) => ({ name: p, value: p })));
      });
  }

  addEntryCard(): void {
    this.manualEntriesForm.push(this.buildEntryCardGroup());
  }

  /** Remove a card, keeping a minimum of 1. */
  removeEntryCard(index: number): void {
    if (this.manualEntriesForm.length > 1) {
      this.manualEntriesForm.removeAt(index);
    }
  }

  isExpenseCard(card: FormGroup): boolean {
    return card.get('entryKind')?.value === 'expense';
  }

  isExemptCard(card: FormGroup): boolean {
    return card.get('entryKind')?.value === 'income_exempt';
  }

  /** Account options filtered to the card's kind — income cards only offer
   *  'income'-type accounts, expense cards only 'expense'-type accounts. */
  accountOptionsForCard(card: FormGroup): ISelectItem[] {
    const expectedType = this.isExpenseCard(card) ? 'expense' : 'income';
    return this.entryAccountOptionsRaw()
      .filter((a) => a.type === expectedType)
      .map((a) => ({ name: `${a.code} - ${a.name}`, value: a.code }));
  }

  /** Kind changed — the previously-picked account may no longer be valid for
   *  the new kind (different type), so clear it rather than silently keep a
   *  now-invalid selection. */
  onEntryKindChange(card: FormGroup): void {
    card.get('accountCode')?.setValue('');
  }

  /** Mirrors the backend: for income, vatPercent is fixed at 100 internally,
   *  so any non-zero amount always posts a VAT line — required whenever
   *  there's an amount. For expense it depends on the user-entered
   *  vatPercent. Never required for income_exempt (no VAT at all). */
  isVatReportingPeriodRequired(card: FormGroup): boolean {
    if (this.isExemptCard(card)) return false;
    const amount = Number(card.get('amount')?.value) || 0;
    if (amount === 0) return false;
    if (!this.isExpenseCard(card)) return true;
    return (Number(card.get('vatPercent')?.value) || 0) > 0;
  }

  private get validCards(): FormGroup[] {
    return this.entryCards.filter((c) => {
      if ((Number(c.get('amount')?.value) || 0) === 0) return false;
      // accountCode only matters for expense — income/income_exempt always
      // post to the fixed '4000' account, no user selection needed.
      return this.isExpenseCard(c) ? !!c.get('accountCode')?.value : true;
    });
  }

  get hasValidEntries(): boolean {
    return this.validCards.length > 0;
  }

  /** yyyy-mm-dd using LOCAL date components (not toISOString, which shifts
   *  by the UTC offset and can land on the wrong calendar day). */
  private toDateOnlyString(value: Date | string | null): string {
    const d = value instanceof Date ? value : (value ? new Date(value) : new Date());
    if (Number.isNaN(d.getTime())) return this.toDateOnlyString(new Date());
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private buildPayload(card: FormGroup, businessNumber: string): ICreateManualJournalEntryPayload {
    const v = card.value;
    const isExpense = v.entryKind === 'expense';
    const isExempt = v.entryKind === 'income_exempt';
    const valueDate = this.toDateOnlyString(v.valueDate);
    return {
      entryKind: v.entryKind,
      businessNumber,
      date: valueDate,
      valueDate,
      vatDate: valueDate,
      reference: v.reference || undefined,
      notes: v.notes || undefined,
      vatReportingPeriod: isExempt ? null : (v.vatReportingPeriod || null),
      lines: [{
        // accountCode/vatPercent/taxPercent only matter for expense — the
        // service forces '4000' + fixed percents for income/income_exempt
        // regardless, but don't send stale values for those kinds.
        accountCode: isExpense ? v.accountCode : undefined,
        amount: Number(v.amount) || 0,
        subCategoryName: isExpense ? (v.subCategoryName || null) : null,
        isEquipment: isExpense ? !!v.isEquipment : false,
        vatPercent: isExpense ? (Number(v.vatPercent) || 0) : undefined,
        taxPercent: isExpense ? (Number(v.taxPercent) || 100) : undefined,
      }],
    };
  }

  saveJournalEntry(): void {
    const businessNumber = this.businessNumber();
    if (!businessNumber || !this.hasValidEntries) return;

    const payloads = this.validCards.map((card) => this.buildPayload(card, businessNumber));

    this.genericService.getLoader().subscribe();
    this.ledgerReportService.createManualJournalEntries(payloads)
      .pipe(
        finalize(() => this.genericService.dismissLoader()),
        catchError((err) => {
          this.genericService.showToast(err?.error?.message || 'שמירת הפקודות נכשלה', 'error');
          return EMPTY;
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this.genericService.showToast('פקודות היומן נשמרו בהצלחה', 'success');
        this.closeJournalEntryModal();
        if (this.isRequestSent()) {
          this.getLedgerReportData(this.startDate(), this.endDate(), this.businessNumber(), this.selectedAccountCode());
        }
      });
  }
}
