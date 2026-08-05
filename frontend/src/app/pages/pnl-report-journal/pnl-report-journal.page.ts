import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { PnLReportJournalService } from './pnl-report-journal.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { IPnlReportData, IRowDataTable, ISelectItem, IUserData } from 'src/app/shared/interface';
import { GenericService } from 'src/app/services/generic.service';
import { AuthService } from 'src/app/services/auth.service';
import { catchError, EMPTY, finalize, map, Observable, of, switchMap, tap } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { BusinessStatus, ReportingPeriodType } from 'src/app/shared/enums';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { TransactionsService } from '../transactions/transactions.page.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ReportReviewService } from 'src/app/services/report-review.service';


@Component({
    selector: 'app-pnl-report-journal',
    templateUrl: './pnl-report-journal.page.html',
    styleUrls: ['./pnl-report-journal.page.scss', '../../shared/shared-styling.scss'],
    standalone: false
})
export class PnLReportJournalPage implements OnInit {

  // Services
  private gs = inject(GenericService);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);

  // Business related
  businessNumber = signal<string>("");
  businessName = signal<string>("");
  businessNamesList: ISelectItem[] = [];
  BusinessStatus = BusinessStatus;
  businessStatus: BusinessStatus = BusinessStatus.SINGLE_BUSINESS;
  businessOptions = this.gs.businessSelectItems;

  // Filter related
  form: FormGroup = this.fb.group({});
  filterConfig: FilterField[] = [];
  startDate = signal<string>("");
  endDate = signal<string>("");

  pnlReportForm: FormGroup;
  pnlReport: IPnlReportData;
  userData: IUserData;
  displayExpenses: boolean = false;
  totalExpense: number = 0;
  reportingPeriodType = ReportingPeriodType;

  /** Raw (unformatted) income from the last fetch — used to gate the
   *  "עוסק זעיר" checkbox against the ITA's 120,000 ILS annual threshold. */
  incomeRaw: number = 0;
  /** True once the user has manually edited the income field in-browser —
   *  the exported PDF then uses `incomeRaw` as an override instead of
   *  re-deriving income from journal entries. */
  incomeEdited: boolean = false;
  /** "עוסק זעיר" (small trader) flat 30%-of-income deduction toggle. */
  osekZair = signal<boolean>(false);
  readonly osekZairThreshold = 120000;
  readonly osekZairCategory = 'ניכוי 30% הוצאות לעוסק זעיר';

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  // ── Unconfirmed-expenses gate (mirrors VAT report) ──
  visibleConfirmTransDialog = signal<boolean>(false);

  /** Drive-inbox pre-flight dialog — runs before the trans-confirm dialog so
   *  any new invoices in `inbox/` land as confirmed expenses before they
   *  need to show up in the P&L numbers. */
  visibleInboxDialog = signal<boolean>(false);


  /** True when the report for the currently-selected period has already been
   *  marked as submitted. Swaps the "סמן כדווח" button for "הדוח הוגש". */
  reportSubmitted = signal<boolean>(false);
  transToConfirm: Observable<IRowDataTable[]>;
  arrayLength = signal<number>(0);
  isLoadingButtonConfirmDialog = signal<boolean>(false);
  isRequestSent = signal<boolean>(false);
  /** Loader for the submit-pipeline gap between "הצג" and the next visible
   *  UI (review dialog OR report data). The genericService global loader
   *  only covers the report-fetch step; this fills the previewCheck +
   *  prompt window before either of those start. */
  isReportLoading = signal<boolean>(false);
  /** Visibility for the redirect-expenses prompt (`<p-dialog>` in the template). */
  redirectPromptVisible = signal<boolean>(false);
  /** Re-entry guard so the prompt isn't scheduled twice when close events fire. */
  private redirectPromptOpen = false;

  isLoadingPDF = signal<boolean>(false);

  constructor(
    public pnlReportService: PnLReportJournalService,
    private formBuilder: FormBuilder,
    public authService: AuthService,
    private genericService: GenericService,
    private fileService: FilesService,
    private transactionService: TransactionsService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private reportReviewService: ReportReviewService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
  }


  async ngOnInit() {

    this.userData = this.authService.getUserDataFromLocalStorage();

    this.businessStatus = this.userData.businessStatus;
    const businesses = this.gs.businesses();

    if (businesses.length === 1) {
      // 1️⃣ Set the signal
      this.businessNumber.set(businesses[0].businessNumber);
      this.businessName.set(businesses[0].businessName);
      // 2️⃣ Set the form so FilterTab works
      this.form.get('businessNumber')?.setValue(businesses[0].businessNumber);
    }
    
    // Listen to business number changes
    this.form.get('businessNumber')?.valueChanges.subscribe(businessNumber => {
      if (!businessNumber) return;
      
      const business = this.gs.businesses().find(
        b => b.businessNumber === businessNumber
      );
      
      if (business) {
        this.businessNumber.set(business.businessNumber);
        this.businessName.set(business.businessName);
      }
    });
    
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

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
        type: 'period',
        controlName: 'period',
        required: true,
        allowedPeriodModes: [ReportingPeriodType.MONTHLY, ReportingPeriodType.BIMONTHLY, ReportingPeriodType.ANNUAL, ReportingPeriodType.DATE_RANGE],
        periodDefaults: this.gs.getDefaultPeriodConfig({ year: currentYear, month: String(currentMonth) })
      },
    ];

    // Clear any previously-rendered report when the user changes business or
    // period — same hygiene VAT applies so a stale report isn't confused with
    // the new selection before the next "הצג" click.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pnlReport = undefined;
        this.totalExpense = 0;
        this.incomeRaw = 0;
        this.incomeEdited = false;
        this.osekZair.set(false);
        this.isRequestSent.set(false);
        this.arrayLength.set(0);
        this.reportSubmitted.set(false);
      });

    // Returning from /report-review — reload the report for the same
    // business/period the user was reviewing instead of waiting for them
    // to re-submit the filter form.
    const returnParams = this.route.snapshot.queryParamMap;
    if (returnParams.get('reviewed')) {
      const bn = returnParams.get('businessNumber') ?? this.businessNumber();
      const start = returnParams.get('startDate') ?? '';
      const end = returnParams.get('endDate') ?? '';
      this.businessNumber.set(bn);
      this.startDate.set(start);
      this.endDate.set(end);
      this.isRequestSent.set(true);
      this.getPnLReportData(start, end, bn);
    }
  }


  onSubmit(formValues: any): void {
    const effectiveBusiness = this.gs.getEffectiveBusinessNumber(this.form, formValues.businessNumber, this.userData);
    const { startDate, endDate } = this.gs.getPeriodDatesFromForm(this.form);

    this.businessNumber.set(effectiveBusiness);
    const business = this.gs.businesses().find(b => b.businessNumber === effectiveBusiness);
    if (business) {
      this.businessName.set(business.businessName);
    }

    this.startDate.set(startDate);
    this.endDate.set(endDate);
    this.isRequestSent.set(true);
    this.isReportLoading.set(true);

    // Cheap pre-flight (folder listing + SELECT 1) — same pattern as the
    // VAT report. Skips the review modal entirely when there's nothing to
    // review; otherwise prompts the user before opening it.
    this.reportReviewService.previewCheck(effectiveBusiness, endDate)
      .pipe(catchError(() => of({ hasPendingDocs: true, hasUnconfirmedExpenses: true })))
      .subscribe(check => {
        if (!check.hasPendingDocs && !check.hasUnconfirmedExpenses) {
          this.proceedDirectlyToReport();
          return;
        }
        this.promptReviewBeforeReport(check);
      });
  }

  private proceedDirectlyToReport(): void {
    // Hand off to getPnLReportData — that flow uses genericService's
    // global loader; clear ours so the two don't stack.
    this.isReportLoading.set(false);
    this.getPnLReportData(this.startDate(), this.endDate(), this.businessNumber());
  }

  private promptReviewBeforeReport(
    check: { hasPendingDocs: boolean; hasUnconfirmedExpenses: boolean },
  ): void {
    // Clear our local loader before the prompt opens — the user needs to
    // see the confirm dialog without a spinner stacked behind it. Both
    // accept and reject paths take over loader responsibility (review
    // dialog has its own; proceedDirectlyToReport hands off to the
    // genericService global loader).
    this.isReportLoading.set(false);
    const reasons: string[] = [];
    if (check.hasPendingDocs) reasons.push('מסמכים שעדיין לא אושרו');
    if (check.hasUnconfirmedExpenses) reasons.push('תנועות שטרם אושרו כהוצאות');
    const detail = reasons.join(' ו');
    this.confirmationService.confirm({
      key: 'reviewBeforeReport',
      header: 'נמצאו הוצאות שעדיין לא אושרו',
      message: `מצאנו ${detail}. האם תרצה לעבור עליהן כעת?`,
      // Match the doc-create confirmation design: warning-triangle icon and
      // two black (contrast) buttons.
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { severity: 'contrast', label: 'כן' },
      rejectButtonProps: { severity: 'contrast', label: 'לא כרגע' },
      accept: () => {
        this.router.navigate(['report-review'], {
          queryParams: {
            businessNumber: this.businessNumber(),
            startDate: this.startDate(),
            endDate: this.endDate(),
            returnTo: 'pnl-report',
          },
        });
      },
      reject: () => {
        this.proceedDirectlyToReport();
      },
    });
  }


  getTransToConfirm(): void {
    this.visibleConfirmTransDialog.set(true);
    this.transToConfirm = this.transactionService.getTransToConfirm(
      this.startDate(),
      this.endDate(),
      this.businessNumber()
    ).pipe(
      catchError((err) => {
        console.error("Error in getTransToConfirm:", err);
        return EMPTY;
      }),
      tap((data: IRowDataTable[]) => {
        // Set arrayLength FIRST so closeDialogWithoutConfirm sees the correct
        // value when it decides whether to prompt for pending expenses.
        this.arrayLength.set(data?.length ?? 0);
        if (!data?.length) {
          this.closeDialogWithoutConfirm(false);
        }
      }),
      map((data) => {
        return data?.map((row) => ({
          ...row,
          sum: this.genericService.addComma(Math.abs(row.sum as number)),
          isRecognized: row.isRecognized ? 'כן' : 'לא',
          businessNumber: row?.businessNumber === this.userData.businessNumber
            ? this.userData.businessName
            : this.userData.spouseBusinessName,
        }));
      }),
    );
  }


  /** Two-way model for `[(visible)]` on the inline p-dialog (X button sync). */
  get redirectPromptVisibleModel(): boolean {
    return this.redirectPromptVisible();
  }
  set redirectPromptVisibleModel(value: boolean) {
    this.redirectPromptVisible.set(value);
    if (!value) this.redirectPromptOpen = false;
  }


  closeDialogWithoutConfirm(event: boolean): void {
    this.visibleConfirmTransDialog.set(event);

    // User cancelled the confirm dialog while expenses are still pending.
    // Block the empty report and prompt them to re-open the confirm flow.
    // 250ms gives the confirm-trans dialog and its overlay portal time to
    // fully unmount before the new dialog opens.
    if (!event && this.arrayLength() > 0 && !this.redirectPromptOpen) {
      this.redirectPromptOpen = true;
      setTimeout(() => this.openPendingExpensesPrompt(), 250);
      return;
    }

    this.getPnLReportData(this.startDate(), this.endDate(), this.businessNumber());
  }


  private openPendingExpensesPrompt(): void {
    this.redirectPromptVisible.set(true);
  }


  onRedirectPromptCancel(): void {
    this.redirectPromptVisible.set(false);
    this.redirectPromptOpen = false;
  }


  onRedirectPromptAccept(): void {
    this.redirectPromptVisible.set(false);
    this.redirectPromptOpen = false;
    setTimeout(() => this.getTransToConfirm(), 0);
  }


  confirmTrans(event: { transactions: IRowDataTable[], files: { id: number, file: File }[] }): void {
    if (!event.transactions.length) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        sticky: true,
        detail: "לא נבחרה אף תנועה",
        life: 3000,
        key: 'br',
      });
      return;
    }
    this.isLoadingButtonConfirmDialog.set(true);

    this.transactionService.addTransToExpense(event.transactions)
      .pipe(
        catchError((err) => {
          console.error("Error in confirmTrans: ", err);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            sticky: true,
            detail: "אירעה שגיאה באישור התנועות, נא לנסות שוב מאוחר יותר",
            life: 3000,
            key: 'br',
          });
          this.isLoadingButtonConfirmDialog.set(false);
          return EMPTY;
        }),
        switchMap((res) => {
          if (event.files && event.files.length > 0) {
            return this.fileService.uploadAndSaveMultipleFilesToServer(
              event.files,
              this.businessNumber(),
              (uploadedFiles) => this.pnlReportService.addFileToExpenses(uploadedFiles, true),
            ).pipe(
              tap(() => {
                this.messageService.add({
                  severity: 'success',
                  summary: 'Success',
                  detail: `אושרו ${event.transactions.length} תנועות והועלו ${event.files.length} קבצים בהצלחה`,
                  life: 3000,
                  key: 'br',
                });
              }),
              catchError((fileErr) => {
                console.error("Error uploading files:", fileErr);
                this.messageService.add({
                  severity: 'error',
                  summary: 'Error',
                  detail: `אושרו ${event.transactions.length} תנועות אך העלאת הקבצים נכשלה`,
                  life: 5000,
                  key: 'br',
                });
                return of(res);
              }),
            );
          }
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: `אושרו ${event.transactions.length} תנועות בהצלחה`,
            life: 3000,
            key: 'br',
          });
          return of(res);
        }),
        finalize(() => {
          this.isLoadingButtonConfirmDialog.set(false);
          this.visibleConfirmTransDialog.set(false);
        }),
      )
      .subscribe(() => {
        // After confirming, render the PnL report with the now-up-to-date data.
        this.getPnLReportData(this.startDate(), this.endDate(), this.businessNumber());
      });
  }


  getPnLReportData(startDate: string, endDate: string, businessNumber: string) {
    this.genericService.getLoader().subscribe();
    this.pnlReportService.getPnLReportData(startDate, endDate, businessNumber, this.osekZair())
      .pipe(
        finalize(() => this.genericService.dismissLoader()),
        catchError((err) => {
          console.log("err in get pnl report data: ", err);
          return EMPTY;
        }),
        map((data: IPnlReportData) => {
          console.log("pnl report: ", data);
          this.incomeRaw = Number(data.income);
          this.incomeEdited = false;
          data.income = this.genericService.addComma(data.income);
          data.netProfitBeforeTax = this.genericService.addComma(data.netProfitBeforeTax);
          return data;
        }),
        tap((data) => {
          this.pnlReport = data;
          // Reset before accumulating — this method now runs again after the
          // confirm-trans flow, so a stale accumulator would double-count.
          this.totalExpense = 0;
          for (const expense of this.pnlReport.expenses) {
            this.totalExpense += expense.total;
          }
        })
      )
      .subscribe();

    // Fire alongside the report fetch — drives the "סמן כדווח" vs
    // "הדוח הוגש" button swap once the response lands.
    this.pnlReportService.getReportSubmissionStatus(businessNumber, startDate)
      .pipe(catchError(() => EMPTY))
      .subscribe((status) => this.reportSubmitted.set(status.isSubmitted));
  }

  /** Toggling "עוסק זעיר" re-fetches the report so the backend recomputes
   *  the flat 30% deduction the same way for both the on-screen numbers
   *  and the exported PDF — no duplicated calc on the frontend. */
  onOsekZairToggle(checked: boolean): void {
    this.osekZair.set(checked);
    this.getPnLReportData(this.startDate(), this.endDate(), this.businessNumber());
  }

  updateIncome(event: any) {
    if (event.detail.value === "") {
      event.detail.value = '0';
      this.pnlReport.income = '0';
    }
    const newIncome = this.genericService.convertStringToNumber(event.detail.value);
    this.incomeRaw = newIncome;
    this.incomeEdited = true;

    // Osek-zair mode ties the pseudo-expense to income — a manual income
    // edit (no re-fetch involved) must recompute it locally, same formula
    // the backend uses, or the 30% line goes stale against the new number.
    if (this.osekZair()) {
      const flatDeduction = Number((newIncome * 0.3).toFixed(2));
      this.pnlReport.expenses = [{ sectionName: this.osekZairCategory, total: flatDeduction }];
      this.totalExpense = flatDeduction;
    }

    this.pnlReport.income = newIncome;
    this.pnlReport.netProfitBeforeTax = this.pnlReport.income - this.totalExpense;
    this.pnlReport.netProfitBeforeTax = this.genericService.addComma(this.pnlReport.netProfitBeforeTax);
    this.pnlReport.income = this.genericService.addComma(this.pnlReport.income);
  }


  showExpenses() {
    this.displayExpenses = !this.displayExpenses
  }


  /**
   * "סמן כדווח" — user confirms they've submitted the annual / PnL report.
   * Locks all transactions stamped with the matching period label.
   */
  onMarkAsSubmitted(): void {
    if (!this.startDate() || !this.businessNumber()) return;
    this.confirmationService.confirm({
      key: 'markSubmitted',
      message: 'פעולה זו תנעל את כל ההוצאות בתקופה ולא ניתן יהיה לשנותן. להמשיך?',
      header: 'סימון דוח כדווח',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { severity: 'contrast', label: 'סמן כדווח' },
      rejectButtonProps: { severity: 'secondary', outlined: true, label: 'ביטול' },
      accept: () => {
        this.pnlReportService.markReportAsSubmitted(this.businessNumber(), this.startDate())
          .pipe(
            catchError((err) => {
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'סימון הדוח כדווח נכשל',
                life: 5000,
                key: 'br',
              });
              console.error('markReportAsSubmitted failed:', err);
              return EMPTY;
            }),
          )
          .subscribe((res) => {
            this.messageService.add({
              severity: 'success',
              summary: 'הדוח סומן כדווח',
              detail: `${res.count} תנועות ננעלו לתקופה ${res.periodLabel}`,
              life: 4000,
              key: 'br',
            });
            this.reportSubmitted.set(true);
            // Re-fetch so cached lock state in pnlReport reflects the change.
            this.getPnLReportData(this.startDate(), this.endDate(), this.businessNumber());
          });
      },
      reject: () => {},
    });
  }


  /**
   * Requests a server-rendered PDF (pdfkit, RTL Hebrew) from the backend —
   * same approach as the VAT report — and downloads it. No external
   * template-fill service and no browser print dialog involved, so the
   * output has no browser-injected header/footer.
   */
  createPnlReportPDFfile(): void {
    if (!this.pnlReport) return;

    this.isLoadingPDF.set(true);
    const incomeOverride = this.incomeEdited ? this.incomeRaw : undefined;
    this.pnlReportService.generatePnLReportPDF(this.startDate(), this.endDate(), this.businessNumber(), this.osekZair(), incomeOverride)
      .pipe(
        catchError((err) => {
          console.error('error generating pnl report pdf: ', err);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'הפקת קובץ ה-PDF נכשלה. אנא נסה שוב.',
            life: 5000,
            key: 'br',
          });
          return EMPTY;
        }),
        finalize(() => this.isLoadingPDF.set(false)),
      )
      .subscribe((blob) => {
        this.fileService.downloadFile(`דוח רווח והפסד ${this.startDate()} - ${this.endDate()}.pdf`, blob);
      });
  }

  formatReportDate(dateStr: string): string {
    // backend date strings are currently dd/MM/yyyy (or dd-MM-yyyy),
    // display them in dd.MM.yyyy for this page.
    if (!dateStr) return '';
    return String(dateStr).replace(/[\/-]/g, '.');
  }


}