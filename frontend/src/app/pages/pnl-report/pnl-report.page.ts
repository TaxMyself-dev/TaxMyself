import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PnLReportService } from './pnl-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ICreateDataDoc, IPnlReportData, IRowDataTable, ISelectItem, IUserData } from 'src/app/shared/interface';
import { GenericService } from 'src/app/services/generic.service';
import { AuthService } from 'src/app/services/auth.service';
import { catchError, EMPTY, finalize, map, Observable, of, switchMap, tap } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { BusinessStatus, ReportingPeriodType } from 'src/app/shared/enums';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { format as formatDateFns } from 'date-fns';
import { TransactionsService } from '../transactions/transactions.page.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ReportReviewService } from 'src/app/services/report-review.service';


@Component({
    selector: 'app-pnl-report',
    templateUrl: './pnl-report.page.html',
    styleUrls: ['./pnl-report.page.scss', '../../shared/shared-styling.scss'],
    standalone: false
})
export class PnLReportPage implements OnInit {

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

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  // ── Unconfirmed-expenses gate (mirrors VAT report) ──
  visibleConfirmTransDialog = signal<boolean>(false);

  /** Drive-inbox pre-flight dialog — runs before the trans-confirm dialog so
   *  any new invoices in `inbox/` land as confirmed expenses before they
   *  need to show up in the P&L numbers. */
  visibleInboxDialog = signal<boolean>(false);

  /** Visibility for the new unified report-review modal. Supersedes the
   *  two-step chain (visibleInboxDialog → visibleConfirmTransDialog). */
  visibleReviewDialog = signal<boolean>(false);

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
    public pnlReportService: PnLReportService,
    private formBuilder: FormBuilder,
    public authService: AuthService,
    private genericService: GenericService,
    private fileService: FilesService,
    private transactionService: TransactionsService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private reportReviewService: ReportReviewService,
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
        this.isRequestSent.set(false);
        this.arrayLength.set(0);
        this.reportSubmitted.set(false);
      });
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
    this.reportReviewService.previewCheck(effectiveBusiness)
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
        this.visibleReviewDialog.set(true);
      },
      reject: () => {
        this.proceedDirectlyToReport();
      },
    });
  }

  /** Unified review dialog closed (auto when nothing to review, or
   *  manual after the user works through every row). Proceed straight to
   *  the P&L data load — no trans-confirm middle step. */
  onReviewDialogVisibleChange(visible: boolean): void {
    this.visibleReviewDialog.set(visible);
    if (!visible) {
      this.getPnLReportData(this.startDate(), this.endDate(), this.businessNumber());
    }
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
    this.pnlReportService.getPnLReportData(startDate, endDate, businessNumber)
      .pipe(
        finalize(() => this.genericService.dismissLoader()),
        catchError((err) => {
          console.log("err in get pnl report data: ", err);
          return EMPTY;
        }),
        map((data: IPnlReportData) => {
          console.log("pnl report: ", data);
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

  updateIncome(event: any) {
    if (event.detail.value === "") {
      event.detail.value = '0';
      this.pnlReport.income = '0';
    }
    this.pnlReport.income = this.genericService.convertStringToNumber(event.detail.value);
    this.pnlReport.netProfitBeforeTax = this.genericService.convertStringToNumber(this.pnlReport.netProfitBeforeTax as string);
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


  createPnlReportPDFfile(): void {

    this.isLoadingPDF.set(true);
    let dataTable: (string | number)[][] = [];
    this.pnlReport.expenses.forEach((expense) => {
      // טבלת הוצאות לפילפאסטר: אותו פורמט כמו הכותרות (ש"ח + 2 ספרות אחרי נקודה)
      dataTable.push([this.formatShekelAmount(expense.total), expense.category]);
    })
    
    const effectiveBusinessNumber = (this.businessNumber() ?? this.userData?.businessNumber ?? '').toString();
    // תאריך הפקת הדוח (issue date) - פורמט עקבי עם שאר תאריכי הדוחות שנשלחים לפילפאסטר
    const issueDate = formatDateFns(new Date(), 'dd/MM/yyyy');
     
    const data: ICreateDataDoc = {
      fid: "ydAEQsvSbC",
      prefill_data: {
        name: [this.userData.fName, this.userData.lName].filter(Boolean).join(' '),
        businessNumber: effectiveBusinessNumber,
        period: `${this.startDate()} - ${this.endDate()}`,
        income: this.formatShekelAmount(this.pnlReport.income),
        profit: this.formatShekelAmount(this.pnlReport.netProfitBeforeTax),
        expenses: this.formatShekelAmount(this.totalExpense),
        issueDate,
        table: dataTable,
      },
    }

    this.pnlReportService.generatePnLReportPDF(data)
      .pipe(
        catchError((err) => {
          console.log("error in create pdf: ", err);
          this.isLoadingPDF.set(false);
          return EMPTY;
        }),
        finalize(() =>{
          this.isLoadingPDF.set(false);
        })
      )
      .subscribe((res) => {
        console.log('res of create pdf: ', res);
        this.fileService.downloadFile("my pdf", res)
      })
  }

  formatReportDate(dateStr: string): string {
    // backend date strings are currently dd/MM/yyyy (or dd-MM-yyyy),
    // display them in dd.MM.yyyy for this page.
    if (!dateStr) return '';
    return String(dateStr).replace(/[\/-]/g, '.');
  }

  private formatShekelAmount(value: number | string | null | undefined): string {
    const raw = value ?? 0;
    const num = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
    const safeNum = Number.isFinite(num) ? num : 0;
    const isNegative = safeNum < 0;
    const abs = Math.abs(safeNum);
    const fixed = abs.toFixed(2); // uses '.' as decimal separator
    const [intPart, fracPart] = fixed.split('.');
    const intWithCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = `${intWithCommas}.${fracPart}`;
    // Put minus on the right for RTL-like appearance, before currency sign
    return isNegative ? `${formatted}- ש"ח` : `${formatted} ש"ח`;
  }


}