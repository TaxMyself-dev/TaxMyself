import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';
import { GenericService } from 'src/app/services/generic.service';
import { AuthService } from 'src/app/services/auth.service';
import { BusinessStatus, ReportingPeriodType } from 'src/app/shared/enums';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { ISelectItem, IUserData } from 'src/app/shared/interface';
import { IJournalEntryDetail, ILedgerLine, ILedgerReport, LedgerReportService } from './ledger-report.service';

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

  // Report data
  ledgerReport: ILedgerReport;
  /** The account filter applied to the currently-shown report (null = all). */
  selectedAccountCode = signal<string | null>(null);
  userData: IUserData;
  isRequestSent = signal<boolean>(false);

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
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

    // Keep businessNumber/businessName signals in sync with the filter select.
    this.form.get('businessNumber')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(businessNumber => {
        if (!businessNumber) return;
        const business = this.gs.businesses().find(b => b.businessNumber === businessNumber);
        if (business) {
          this.businessNumber.set(business.businessNumber);
          this.businessName.set(business.businessName);
        }
      });

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
    // selection — the user must press "הצג" again.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.ledgerReport = undefined;
        this.isRequestSent.set(false);
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

  /** Print the full multi-account view (browser print → "Save as PDF"). */
  print(): void {
    window.print();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Manual journal entry (פקודת יומן ידנית) — UI scaffolding only.
  // saveJournalEntry() currently just logs; the API wiring lands in a later task.
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

  showJournalEntryModal = false;

  journalEntryForm = this.buildEmptyJournalEntry();

  /** today as YYYY-MM-DD for the native date inputs' default value. */
  private todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private buildEmptyJournalEntry() {
    const today = this.todayStr();
    return {
      date: today,
      valueDate: today,
      vatDate: today,
      description: '',
      notes: '',
      lines: [
        { accountCode: '', description: '', debit: 0, credit: 0 },
        { accountCode: '', description: '', debit: 0, credit: 0 },
      ],
    };
  }

  /** Account options for the journal line dropdowns — posting accounts only
   *  (from /reports/ledger-entry-accounts; technical accounts excluded). */
  get journalAccountOptions(): ISelectItem[] {
    return this.entryAccountOptions();
  }

  openJournalEntryModal(): void {
    this.showJournalEntryModal = true;
  }

  closeJournalEntryModal(): void {
    this.journalEntryForm = this.buildEmptyJournalEntry();
    this.showJournalEntryModal = false;
  }

  addLine(): void {
    this.journalEntryForm.lines.push({ accountCode: '', description: '', debit: 0, credit: 0 });
  }

  /** Remove a line, keeping a minimum of 2 lines. */
  removeLine(index: number): void {
    if (this.journalEntryForm.lines.length > 2) {
      this.journalEntryForm.lines.splice(index, 1);
    }
  }

  get totalDebit(): number {
    return this.journalEntryForm.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  }

  get totalCredit(): number {
    return this.journalEntryForm.lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  }

  /** Single-entry: no debit=credit balancing required. The only gate on שמור is
   *  that at least one line carries an amount. */
  get hasAnyAmount(): boolean {
    return this.journalEntryForm.lines.some(
      (l) => (Number(l.debit) || 0) !== 0 || (Number(l.credit) || 0) !== 0,
    );
  }

  saveJournalEntry(): void {
    // Scaffolding: log the payload; API wiring comes in the next task.
    console.log('[ledger] manual journal entry (scaffold):', JSON.parse(JSON.stringify(this.journalEntryForm)));
    this.closeJournalEntryModal();
  }
}
