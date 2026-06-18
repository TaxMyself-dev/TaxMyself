import { Component, computed, DestroyRef, inject, Input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { VatReportService } from './vat-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { EMPTY, Observable, catchError, filter, finalize, forkJoin, from, fromEvent, map, of, switchMap, take, tap } from 'rxjs';
import { BusinessStatus, FormTypes, ICellRenderer, inputsSize, ReportingPeriodType, ReportingPeriodTypeLabels } from 'src/app/shared/enums';
//import { ButtonSize } from 'src/app/shared/button/button.enum';
import { ButtonSize } from 'src/app/components/button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ISelectItem, ITableRowAction, IUserData, IVatReportData } from 'src/app/shared/interface';
import { Router } from '@angular/router';
import { FilesService, IFileUploadItem } from 'src/app/services/files.service';
import { ModalController } from '@ionic/angular';
import { PopupConfirmComponent } from 'src/app/shared/popup-confirm/popup-confirm.component';
import { GenericService } from 'src/app/services/generic.service';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';
import { ButtonColor } from 'src/app/components/button/button.enum';
import { TransactionsService } from '../transactions/transactions.page.service';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ReportReviewService } from 'src/app/services/report-review.service';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';


@Component({
  selector: 'app-vat-report',
  templateUrl: './vat-report.page.html',
  styleUrls: ['./vat-report.page.scss', '../../shared/shared-styling.scss'],
  standalone: false
})
export class VatReportPage implements OnInit {

  private gs = inject(GenericService);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);

  confirmationService = inject(ConfirmationService);
  private reportReviewService = inject(ReportReviewService);

  // Business related
  businessNumber = signal<string>("");
  BusinessStatus = BusinessStatus;
  businessStatus: BusinessStatus = BusinessStatus.SINGLE_BUSINESS;
  businessOptions = this.gs.businessSelectItems;

  // Filter related
  form: FormGroup = this.fb.group({});
  filterConfig: FilterField[] = [];
  startDate = signal<string>("");
  endDate = signal<string>("");

  visibleConfirmTransDialog = signal<boolean>(false);

  /** Visibility for the Drive-inbox pre-flight dialog. Opened by onSubmit()
   *  BEFORE the existing trans-confirm pre-flight so any new invoices land
   *  as confirmed expenses before they get classified into the VAT report. */
  visibleInboxDialog = signal<boolean>(false);

  /** Visibility for the new unified report-review modal. Supersedes the
   *  two-step chain (visibleInboxDialog → visibleConfirmTransDialog) — one
   *  modal now handles both documents and transactions in one table. */
  visibleReviewDialog = signal<boolean>(false);

  /** True when the report for the currently-selected period has already been
   *  marked as submitted (any transaction in the period has `isLocked = true`).
   *  Drives the swap between the "סמן כדווח" button and the "הדוח הוגש" badge. */
  reportSubmitted = signal<boolean>(false);

  readonly ButtonSize = ButtonSize;
  readonly reportingPeriodType = ReportingPeriodType;
  readonly UPLOAD_FILE_FIELD_NAME = 'fileName';
  readonly UPLOAD_FILE_FIELD_FIREBASE = 'firebaseFile';
  readonly COLUMNS_TO_IGNORE = ['businessNumber', 'id', 'file', 'transId', 'vatReportingDate', 'firebaseFile', 'fileName'];
  readonly ACTIONS_TO_IGNORE = ['preview']

  years: number[] = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
  vatReportData = signal<IVatReportData>(null);
  arrayLength = signal<number>(0);
  isLoadingButtonConfirmDialog = signal<boolean>(false);
  isLoadingStatePeryodSelectButton = signal<boolean>(false);
  isRequestSent = signal<boolean>(false);
  displayExpenses: boolean = false;
  tableActions: ITableRowAction[];
  fileActions: ITableRowAction[];
  arrayFile: { id: number, file: File | string }[] = [];
  filesAttachedMap = signal<Map<number, File>>(new Map());
  previousFile: string;
  tableData$: Observable<IRowDataTable[]>;
  items$: Observable<IRowDataTable[]>;
  item: IRowDataTable;
  rows: IRowDataTable[] = [];
  isSkip: boolean = false;
  userData: IUserData;

  optionsTypesList = [{ value: ReportingPeriodType.MONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.MONTHLY] },
  { value: ReportingPeriodType.BIMONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.BIMONTHLY] }];
  transToConfirm: Observable<IRowDataTable[]>;
  dataTable: Observable<IRowDataTable[]>;


  readonly fieldsNamesToShow: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [
    { name: ExpenseFormColumns.SUPPLIER, value: ExpenseFormHebrewColumns.supplier, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.DATE, value: ExpenseFormHebrewColumns.date, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    { name: ExpenseFormColumns.SUM, value: ExpenseFormHebrewColumns.sum, type: FormTypes.NUMBER, cellRenderer: ICellRenderer.AMOUNT_ILS },
    { name: ExpenseFormColumns.CATEGORY, value: ExpenseFormHebrewColumns.category, type: FormTypes.DDL },
    { name: ExpenseFormColumns.SUB_CATEGORY, value: ExpenseFormHebrewColumns.subCategory, type: FormTypes.DDL },
    // Combined amount + recognition % (same renderer the confirm-expense dialog uses).
    { name: ExpenseFormColumns.TOTAL_VAT, value: ExpenseFormHebrewColumns.totalVat, cellRenderer: ICellRenderer.AMOUNT_WITH_PERCENT },
    { name: ExpenseFormColumns.TOTAL_TAX, value: ExpenseFormHebrewColumns.totalTax, cellRenderer: ICellRenderer.AMOUNT_WITH_PERCENT },
  ];

  reportOrder: string[] = [
    'vatableTurnover',
    'vatOnVatableTurnover',
    'nonVatableTurnover',
    'vatRefundOnAssets',
    'vatRefundOnExpenses',
    'vatPayment'
  ];

  vatReportFieldTitles = {
    vatableTurnover: 'עסקאות חייבות',
    vatOnVatableTurnover: 'סה"כ מע"מ',
    nonVatableTurnover: 'עסקאות פטורות או בשיעור אפס',
    vatRefundOnAssets: 'תשומות ציוד',
    vatRefundOnExpenses: 'תשומות אחרות',
    vatPayment: 'סה"כ לתשלום'
  };

  readonly PDF_FOOTER_TEXT = 'Created by KeepInTax LTD | תוכנה מאושרת על ידי רשות המיסים';

  buttonSize = ButtonSize;
  inputSize = inputsSize;
  buttonColor = ButtonColor;

  constructor(private genericService: GenericService, private dateService: DateService, private filesService: FilesService, private router: Router, public vatReportService: VatReportService, private formBuilder: FormBuilder, private expenseDataService: ExpenseDataService, private modalController: ModalController, public authService: AuthService, private transactionService: TransactionsService, private messageService: MessageService
  ) { }


  async ngOnInit() {

    this.setFileActions();

    this.userData = this.authService.getUserDataFromLocalStorage();
    this.businessStatus = this.userData.businessStatus;
    const businesses = this.gs.businesses();
    this.businessNumber.set(businesses[0].businessNumber);

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const defaultMonthValue = this.gs.getDefaultMonthValue(currentMonth, ReportingPeriodType.BIMONTHLY);

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
        periodDefaults: this.gs.getDefaultPeriodConfig({
          periodMode: ReportingPeriodType.BIMONTHLY,
          year: currentYear,
          month: defaultMonthValue
        })
      },
    ];

    // Clear any previously-rendered report when the user changes the business
    // or period. Prevents confusing a stale report with the new selection
    // before the user clicks "הצג". Also resets arrayLength so the empty-state
    // message is gated on a fresh count, not a stale one from a previous run.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.vatReportData.set(null);
        this.dataTable = of([]);
        this.rows = [];
        this.isRequestSent.set(false);
        this.arrayLength.set(0);
        // New period selected — submission state is unknown until the next
        // report fetch resolves it.
        this.reportSubmitted.set(false);
      });
  }

  beforeSelectFile(event): void {

    if (!this.isSkip && event.data.file != "") {
      this.isSkip = true;
      event.event.preventDefault()
      from(this.modalController.create({
        component: PopupConfirmComponent,
        componentProps: {
          message: "להוצאה זו כבר שמור קובץ, אתה בטוח שברצונך להחליפו?",
          buttonTextConfirm: "כן",
          buttonTextCancel: "לא"
        },
        cssClass: 'vatReport-modal'
      }))
        .pipe(
          catchError((err) => {
            alert("openPopupMessage error");
            return EMPTY;
          }),
          switchMap((modal) => from(modal.present())
            .pipe(
              catchError((err) => {
                alert("openPopupMessage switchMap error");
                console.log(err);
                return EMPTY;
              }),
              switchMap(() => from(modal.onWillDismiss())
                .pipe(
                  catchError((err) => {
                    console.log("err in close popover get vat report: ", err);
                    return EMPTY;
                  })
                ))
            )))
        .subscribe((res) => {
          console.log("res in close popover: ", res);
          if (res.data) {
            event.event.target.click();
          }
          this.isSkip = false
        });
    }
  }

  addFile(event: any, row: IRowDataTable): void {
    console.log("in add file");

    if ((row.firebaseFile !== "" && row.firebaseFile !== undefined && row.firebaseFile !== null)) { // if already exist file
      if (event.target.files[0]) { // choose another file
        console.log("in if add file");

        row[this.UPLOAD_FILE_FIELD_FIREBASE] = event.target.files[0]; // chnage file in row
        row[this.UPLOAD_FILE_FIELD_NAME] = event.target.files[0]?.name;
        console.log("array file: ", this.arrayFile);

        this.arrayFile.map((expense) => { // change file in array
          if (expense.id === row.id) {
            expense.file = event.target.files[0];
          }
        })
      }
      else { // for delete file
        row[this.UPLOAD_FILE_FIELD_FIREBASE] = "";
        row[this.UPLOAD_FILE_FIELD_NAME] = "";
        this.arrayFile = this.arrayFile.filter((expense) => {
          return expense.id !== row.id
        })
      }
    }
    else { // first time selected file
      row[this.UPLOAD_FILE_FIELD_FIREBASE] = event.target.files[0];
      row[this.UPLOAD_FILE_FIELD_NAME] = event.target.files[0]?.name;
      this.arrayFile.push({ id: row.id as number, file: event.target.files[0] })
    }
  }

  onPreviewFileClicked(expense: IRowDataTable): void {
    if (!(expense.file === undefined || expense.file === "" || expense.file === null)) {
      this.filesService.previewFile(expense.file as string).subscribe();

    }
    else {
      alert("לא נשמר קובץ עבור הוצאה זו")
    }
  }

  onSubmit(formValues: any): void {
    const effectiveBusiness = this.gs.getEffectiveBusinessNumber(this.form, formValues.businessNumber, this.userData);
    const { startDate, endDate } = this.gs.getPeriodDatesFromForm(this.form);

    this.isLoadingStatePeryodSelectButton.set(true);
    this.businessNumber.set(effectiveBusiness);
    this.startDate.set(startDate);
    this.endDate.set(endDate);
    this.isRequestSent.set(true);

    // Cheap pre-flight (folder listing + SELECT 1, no OCR). Decides
    // whether to bother opening the full review modal at all:
    //   - inbox empty AND no unconfirmed expenses → skip dialog, jump
    //     straight to the report data load.
    //   - otherwise → ask the user "review now or later?" — yes opens
    //     the modal, no proceeds to the report without reviewing.
    // On any network failure the safe fallback is to open the modal
    // (better to surface review rows the user might miss than to skip
    // them silently).
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

  /** Pre-flight came back with NO files-to-OCR and NO unconfirmed
   *  expenses — skip the review modal entirely and load the report data.
   *  Also reached from the prompt's reject path ("לא כרגע"), where the
   *  loader was cleared by promptReviewBeforeReport to avoid stacking
   *  behind the confirm dialog — re-engage it here so the page shows the
   *  loader during the getVatReportData round-trip. Idempotent: when the
   *  caller already had the flag set (the direct-to-report branch), this
   *  is a no-op. */
  private proceedDirectlyToReport(): void {
    this.isLoadingStatePeryodSelectButton.set(true);
    this.getVatReportData(this.startDate(), this.endDate(), this.businessNumber());
    this.getDataTable(this.startDate(), this.endDate(), this.businessNumber());
  }

  /** Pre-flight found pending work. Ask the user whether to review now
   *  (opens the full modal) or skip (jump to the report). The Hebrew
   *  message references whichever signals tripped so the user knows what
   *  they're being asked about. */
  private promptReviewBeforeReport(
    check: { hasPendingDocs: boolean; hasUnconfirmedExpenses: boolean },
  ): void {
    // Clear the page-loader before the prompt opens so the user sees the
    // confirm dialog without a spinner stacked behind it. The loader
    // re-engages on Yes (review dialog has its own spinner — see the
    // `&& !visibleReviewDialog()` guard in the HTML) and on No
    // (proceedDirectlyToReport reverts to getVatReportData which keeps
    // isLoadingStatePeryodSelectButton true until its finalize fires).
    this.isLoadingStatePeryodSelectButton.set(false);
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
   *  the report data load — no trans-confirm middle step. */
  onReviewDialogVisibleChange(visible: boolean): void {
    this.visibleReviewDialog.set(visible);
    if (!visible) {
      this.getVatReportData(this.startDate(), this.endDate(), this.businessNumber());
      this.getDataTable(this.startDate(), this.endDate(), this.businessNumber());
    }
  }

  
  getTransToConfirm(): void {
    this.visibleConfirmTransDialog.set(true);
    this.transToConfirm = this.transactionService.getTransToConfirm(
      this.startDate(),
      this.endDate(),
      this.businessNumber()
    ).pipe(
      catchError(err => {
        console.error("Error in getTransToConfirm:", err);
        return EMPTY;
      }),
      tap((data: IRowDataTable[]) => {
        // Set arrayLength FIRST so closeDialogWithoutConfirm sees the correct
        // value (used to decide whether to prompt for pending expenses).
        this.arrayLength.set(data?.length ?? 0);
        if (!data?.length) {
          this.closeDialogWithoutConfirm(false);
        }
        console.log("🚀 ~ tap ~ data:", data)
      }),
      map(data => {
        return data?.map(row => ({
          ...row,
          sum: this.genericService.addComma(Math.abs(row.sum as number)),
          isRecognized: row.isRecognized ? 'כן' : 'לא',
          businessNumber: row?.businessNumber === this.userData.businessNumber
            ? this.userData.businessName
            : this.userData.spouseBusinessName
        }))
      }
      ),

    )

  }


  getVatReportData(startDate: string, endDate: string, businessNumber: string) {
    console.log("in get vat report data");
    // this.isLoading.set(true);
    // this.genericService.getLoader().subscribe();

    console.log("startDate is ", startDate);
    console.log("endDate is ", endDate);
    console.log("businessNumber is ", businessNumber);

    this.vatReportService.getVatReportData(startDate, endDate, businessNumber)
      .pipe(
        finalize(() => this.isLoadingStatePeryodSelectButton.set(false)),
        catchError((error) => {
          console.log("error in get vat report data: ", error);
          return EMPTY;
        }),
        map((data) => {
          Object.keys(data).forEach((field) => { //convert all to type string for display with comma
            data[field] = this.genericService.addComma(data[field]);
          });
          console.log(data);
          return data;
        })
      )
      .subscribe((res) => {
        console.log("🚀 ~ VatReportPage ~ getVatReportData ~ res:", res);

        this.vatReportData.set(res);
        console.log("🚀 ~ VatReportPage ~ .subscribe ~ this.vatReportData in subscribe:", this.vatReportData())
      });

    // Fire alongside the report fetch — drives the "סמן כדווח" vs
    // "הדוח הוגש" button swap once the response lands.
    this.vatReportService.getReportSubmissionStatus(businessNumber, startDate)
      .pipe(catchError(() => EMPTY))
      .subscribe((status) => this.reportSubmitted.set(status.isSubmitted));
  }

  updateIncome(event: any) {
    console.log("updateIncome event: ", event);

    if (event === "") {
      console.log("event is empty string, setting to 0");
      event = '0';
    }

    // Step 1: Update vatableTurnover
    this.vatReportData.update((prev) => ({
      ...prev,
      vatableTurnover: event, // Update vatableTurnover with the new value
    }));
    // }
    // else {


    // Step 2: Convert all fields to number for calculation
    // const numericData = Object.fromEntries(
    //   Object.entries(this.vatReportData()).map(([key, value]) => [
    //     key,
    //     this.genericService.convertStringToNumber(value),
    //   ])
    // ) as IVatReportData;

    const numericData = {} as IVatReportData;
    Object.entries(this.vatReportData()).forEach(([key, value]) => {
      // numericData[key as keyof IVatReportData] = 15;
      numericData[key as keyof IVatReportData] = this.genericService.convertStringToNumber(value);
    });
    console.log("🚀 ~ VatReportPage ~ updateIncome ~ numericData:", numericData)

    // Step 3: Recalculate vatPayment
    const vatPayment = (
      Number(numericData.vatableTurnover) * Number(numericData.vatRate) -
      Number(numericData.vatRefundOnAssets) -
      Number(numericData.vatRefundOnExpenses)
    ).toFixed(2);

    // Step 4: Update vatPayment
    this.vatReportData.update((prev) => ({
      ...numericData,
      vatPayment,
    }));

    // Step 5: Convert all values back to display strings
    // const stringFormatted = Object.fromEntries(
    //   Object.entries(this.vatReportData()).map(([key, value]) => [
    //     key,
    //     this.genericService.addComma(value),
    //   ])
    // ) as IVatReportData;
    const stringFormatted = {} as IVatReportData;
    Object.entries(this.vatReportData()).forEach(([key, value]) => {
      stringFormatted[key as keyof IVatReportData] = this.genericService.addComma(value);
    });


    this.vatReportData.set(stringFormatted);
    // }
  }

  /** Visibility for the redirect-expenses prompt (`<p-dialog>` in the template). */
  redirectPromptVisible = signal<boolean>(false);

  /** Re-entry guard — confirm-trans-dialog can fire its close event twice
   *  (button click + inner p-dialog onHide); without this we'd schedule the
   *  prompt twice and could end up with stacked dialogs. */
  private redirectPromptOpen = false;

  /** Two-way model used by `[(visible)]` on the inline p-dialog so the X
   *  close button keeps state in sync. */
  get redirectPromptVisibleModel(): boolean {
    return this.redirectPromptVisible();
  }
  set redirectPromptVisibleModel(value: boolean) {
    this.redirectPromptVisible.set(value);
    if (!value) this.redirectPromptOpen = false;
  }

  closeDialogWithoutConfirm(event: boolean): void {
    console.log("🚀 ~ VatReportPage ~ closeDialogWithoutConfirm ~ event:", event)
    this.visibleConfirmTransDialog.set(event);

    // User cancelled the confirm dialog while expenses are still pending.
    // Block the empty report and prompt them to re-open the confirm flow.
    // 250ms gives the confirm-trans dialog and its overlay portal time to
    // fully unmount before the new dialog opens — keeps overlays from stacking.
    if (!event && this.arrayLength() > 0 && !this.redirectPromptOpen) {
      this.redirectPromptOpen = true;
      setTimeout(() => this.openPendingExpensesPrompt(), 250);
      return;
    }

    this.getVatReportData(this.startDate(), this.endDate(), this.businessNumber());
    this.getDataTable(this.startDate(), this.endDate(), this.businessNumber());
  }

  /** Show the redirect prompt (driven by an inline <p-dialog>, not
   *  ConfirmationService — direct click handlers, no first-click-no-op). */
  private openPendingExpensesPrompt(): void {
    this.redirectPromptVisible.set(true);
  }

  /** "ביטול" inside the redirect prompt — close it and stay on this page. */
  onRedirectPromptCancel(): void {
    this.redirectPromptVisible.set(false);
    this.redirectPromptOpen = false;
  }

  /** "מעבר לאישור הוצאות" inside the redirect prompt — close it and re-open
   *  the confirm-trans dialog so the user can confirm the pending expenses. */
  onRedirectPromptAccept(): void {
    this.redirectPromptVisible.set(false);
    this.redirectPromptOpen = false;
    // Defer one tick so p-dialog's hide animation finishes before the
    // confirm-trans dialog opens — prevents brief overlay stacking.
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
        key: 'br'
      });
      return;
    }
    console.log("🚀 ~ VatReportPage ~ confirmTrans ~ event:", event)
    this.isLoadingButtonConfirmDialog.set(true);

    // Step 1: Confirm transactions as expenses
    this.transactionService.addTransToExpense(event.transactions)
      .pipe(
        catchError((err) => {
          console.log("Error in confirmTrans: ", err);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            sticky: true,
            detail: "אירעה שגיאה באישור התנועות, נא לנסות שוב מאוחר יותר",
            life: 3000,
            key: 'br'
          });
          this.isLoadingButtonConfirmDialog.set(false);
          return EMPTY;
        }),
        switchMap((res) => {
          // Step 2: If files were attached, upload and attach them
          if (event.files && event.files.length > 0) {
            console.log(`Uploading ${event.files.length} files for confirmed transactions...`);
            return this.filesService.uploadAndSaveMultipleFilesToServer(
              event.files, this.businessNumber(),
              (uploadedFiles) => this.vatReportService.addFileToExpenses(uploadedFiles, true)
            ).pipe(
              tap(() => {
                this.messageService.add({
                  severity: 'success',
                  summary: 'Success',
                  detail: `אושרו ${event.transactions.length} תנועות והועלו ${event.files.length} קבצים בהצלחה`,
                  life: 3000,
                  key: 'br'
                });
              }),
              catchError((fileErr) => {
                console.error("Error uploading files:", fileErr);
                this.messageService.add({
                  severity: 'error',
                  summary: 'Error',
                  detail: `אושרו ${event.transactions.length} תנועות אך העלאת הקבצים נכשלה`,
                  life: 5000,
                  key: 'br'
                });
                return of(res); // Continue anyway
              })
            );
          } else {
            // No files to upload
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: `אושרו ${event.transactions.length} תנועות בהצלחה`,
              life: 3000,
              key: 'br'
            });
            return of(res);
          }
        }),
        finalize(() => {
          this.isLoadingButtonConfirmDialog.set(false);
          this.visibleConfirmTransDialog.set(false);
        })
      )
      .subscribe((res) => {
        // Refresh data after transactions are confirmed
        this.getVatReportData(this.startDate(), this.endDate(), this.businessNumber());
        this.getDataTable(this.startDate(), this.endDate(), this.businessNumber());
      })
  }

  // updateIncome(event: any) {
  //   console.log("updateIncome event: ", event);

  //   if (event === "") {
  //     event = '0';
  //     this.vatReportData.update((prevData) => ({
  //       ...prevData,
  //       vatableTurnover: '0',
  //     }));
  //     Object.keys(this.vatReportData()).forEach((field) => { // convert all to type number for math manipulation
  //       this.vatReportData[field] = this.genericService.convertStringToNumber(this.vatReportData[field]);
  //       console.log("🚀 ~ VatReportPage ~ Object.keys ~ this.vatReport[field]:", this.vatReportData[field])

  //     });
  //     this.vatReportData.update((prevData) => ({
  //       ...prevData,
  //       vatPayment: (
  //         Number(this.vatReportData().vatableTurnover) * Number(this.vatReportData().vatRate) -
  //         Number(this.vatReportData().vatRefundOnAssets) -
  //         Number(this.vatReportData().vatRefundOnExpenses)
  //       ).toFixed(2)
  //     }));
  //     Object.keys(this.vatReportData()).map((field) => { //convert all to type string for display with comma
  //       this.vatReportData()[field] = this.genericService.addComma(this.vatReportData()[field]);
  //     });
  //   }
  // }


  getDataTable(startDate: string, endDate: string, businessNumber: string): void {

    this.dataTable = this.expenseDataService.getExpenseForVatReport(startDate, endDate, businessNumber)
      .pipe(
        map((data) => {
          const rows = [];
          console.log("data of table in vat report: ", data);

          // Hide rows with zero VAT — they don't belong in the VAT report
          // table (totals stay accurate since 0 contributes nothing anyway).
          const visible = data.filter(row => Number(row.totalVatPayable ?? 0) !== 0);

          visible.forEach(row => {
            const { reductionDone, reductionPercent, expenseNumber, isEquipment, loadingDate, note, supplierID, userId, isReported, monthReport, ...tableData } = row;
            if (row.file != undefined && row.file != null && row.file != "") {
              tableData[this.UPLOAD_FILE_FIELD_NAME] = row.file; // to show that this expense already has a file
            }
            // totalVatPayable / totalTaxPayable stay as raw numbers — the
            // AMOUNT_WITH_PERCENT cell renderer formats them via the number pipe.
            tableData.sum = this.genericService.addComma(tableData.sum as string);
            rows.push(tableData);
          })
          this.rows = rows;
          return rows
        })
      )
    // .subscribe((res) => {
    // this.dataTable.set(res);
    // console.log("data table in vat report: ", this.dataTable());
    // 
    // })

    //= this.expenseDataService.getExpenseForVatReport(startDate, endDate, businessNumber)


  }

  showExpenses() {
    this.displayExpenses = !this.displayExpenses
  }

  columnsOrderByFunc(a, b): number {
    const columnsAddExpenseOrder = [
      'supplier',
      'date',
      'sum',
      'category',
      'subCategory',
      'vatPercent',
      'taxPercent',
      'totalVat',
      'totalTax',
    ];

    const indexA = columnsAddExpenseOrder.indexOf(a.key);
    const indexB = columnsAddExpenseOrder.indexOf(b.key);

    if (indexA === -1 && indexB !== -1) {
      return 1; // objA is not in the order list, move it to the end
    } else if (indexA !== -1 && indexB === -1) {
      return -1; // objB is not in the order list, move it to the end
    } else if (indexA === -1 && indexB === -1) {
      return 0; // both keys are not in the order list, leave them as is
    }

    if (indexA < indexB) {
      return -1;
    } else if (indexA > indexB) {
      return 1;
    } else {
      return 0;
    }
  }

  onFileChange(e: { row: IRowDataTable, file?: File }) {
    console.log("onFileChange event: ", e);
    this.addFileToExpense(e)
  }


  addFileToExpense(e: { row: IRowDataTable, file?: File }): void {
    this.genericService.getLoader().subscribe();
    this.filesService.addFileToExpense(e.row, this.businessNumber(), e.file)
      .pipe(
        tap(() => {
          this.getDataTable(this.startDate(), this.endDate(), this.businessNumber());
        }),
        finalize(() => {
          this.genericService.dismissLoader();
        })
      )
      .subscribe(() => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'קובץ הועלה בהצלחה',
          life: 5000,
          key: 'br'
        });
      })
  }

  onChange(event: string): void {
    console.log("onChange event: ", event);
    this.updateIncome(event);
  }

  show(): void {
    console.log("in show");

    this.visibleConfirmTransDialog.set(true);
  }


  /**
   * "סמן כדווח" — user confirms they've submitted the report at the tax
   * authority. Locks all transactions stamped with this period so they
   * become read-only (lock icon shows in the תזרים table). Two-step
   * confirm via ConfirmationService to avoid accidental locks.
   */
  onMarkAsSubmitted(): void {
    if (!this.startDate() || !this.businessNumber()) return;
    this.confirmationService.confirm({
      // Scoped key — other ConfirmDialog consumers on this page (file delete /
      // replace) caused the first accept click to be swallowed because the
      // unkeyed dialog instance was receiving the request twice.
      key: 'markSubmitted',
      message: 'פעולה זו תנעל את כל ההוצאות בתקופה ולא ניתן יהיה לשנותן. להמשיך?',
      header: 'סימון דוח כדווח',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { severity: 'contrast', label: 'סמן כדווח' },
      rejectButtonProps: { severity: 'secondary', outlined: true, label: 'ביטול' },
      accept: () => {
        this.vatReportService.markReportAsSubmitted(this.businessNumber(), this.startDate())
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
            // Flip the local flag so the button swaps to the success indicator
            // without waiting for the round-trip on the next getVatReportData.
            this.reportSubmitted.set(true);
            // Re-fetch the report so dataTable rows reflect the new lock state
            // when the user navigates to the תזרים page.
            this.getVatReportData(this.startDate(), this.endDate(), this.businessNumber());
            this.getDataTable(this.startDate(), this.endDate(), this.businessNumber());
          });
      },
      reject: () => {},
    });
  }

  /**
   * Display value for a row in the VAT summary card. Most keys come straight
   * off `vatReportData()`, but `vatOnVatableTurnover` is derived live from
   * `vatableTurnover * vatRate` so it tracks the editable turnover input.
   */
  getReportDisplayValue(key: string): string {
    const data = this.vatReportData();
    if (!data) return '';
    if (key === 'vatOnVatableTurnover') {
      const turnover = this.genericService.convertStringToNumber(String(data.vatableTurnover ?? ''));
      const rate = this.genericService.convertStringToNumber(String(data.vatRate ?? ''));
      if (!Number.isFinite(turnover) || !Number.isFinite(rate)) return '';
      const vat = Math.round(turnover * rate * 100) / 100;
      return this.genericService.addComma(vat);
    }
    return String(data[key] ?? '');
  }

  /**
   * Opens a print-friendly window containing the business details, report
   * period, VAT summary, and the underlying expense rows, then triggers
   * the browser print dialog. The user picks "Save as PDF" to download.
   * Uses the browser's native print pipeline so no PDF dependency is needed.
   */
  exportToPdf(): void {
    const data = this.vatReportData();
    if (!data) return;

    const business = this.gs.businesses().find(b => b.businessNumber === this.businessNumber());
    const businessName = business?.businessName ?? this.userData?.businessName ?? '';
    const businessAddress = business?.businessAddress ?? this.userData?.businessAddress ?? '';
    const businessNum = this.businessNumber();
    const period = `${this.startDate()} - ${this.endDate()}`;

    const summaryHtml = this.reportOrder.map(key => `
      <div class="summary-row ${key === 'vatPayment' ? 'total-row' : ''}">
        <span>${this.escapeHtml(this.vatReportFieldTitles[key])}</span>
        <strong dir="ltr">${this.escapeHtml(this.getReportDisplayValue(key))}</strong>
      </div>
    `).join('');

    const formatAmount = (v: unknown): string => {
      if (v === null || v === undefined || v === '') return '';
      const n = Number(typeof v === 'string' ? v.replace(/,/g, '') : v);
      return Number.isFinite(n) ? n.toLocaleString() : '';
    };

    const expensesRowsHtml = (this.rows ?? []).map(r => `
      <tr>
        <td>${this.escapeHtml(String(r.supplier ?? ''))}</td>
        <td>${this.escapeHtml(String(r.date ?? ''))}</td>
        <td dir="ltr">${this.escapeHtml(String(r.sum ?? ''))}</td>
        <td>${this.escapeHtml(String(r.category ?? ''))}</td>
        <td>${this.escapeHtml(String(r.subCategory ?? ''))}</td>
        <td dir="ltr">${this.escapeHtml(formatAmount(r['totalVatPayable']))}</td>
        <td dir="ltr">${this.escapeHtml(formatAmount(r['totalTaxPayable']))}</td>
      </tr>
    `).join('');

    const expensesSection = (this.rows?.length ?? 0) > 0 ? `
      <div class="section">
        <h2>פירוט ההוצאות</h2>
        <table>
          <thead>
            <tr>
              <th>ספק</th>
              <th>תאריך</th>
              <th>סכום</th>
              <th>קטגוריה</th>
              <th>תת קטגוריה</th>
              <th>מע"מ</th>
              <th>הוצאה מוכרת</th>
            </tr>
          </thead>
          <tbody>${expensesRowsHtml}</tbody>
        </table>
      </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>דוח מע"מ - ${this.escapeHtml(businessName)} - ${this.escapeHtml(period)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; }
    body { font-family: Arial, "Segoe UI", sans-serif; padding: 24px 24px 64px; color: #222; }
    h1 { font-size: 22px; margin: 0 0 16px; text-align: center; }
    .section { margin-bottom: 22px; }
    .section h2 { font-size: 16px; margin: 0 0 10px; border-bottom: 2px solid #444; padding-bottom: 4px; }
    .business-info p { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: right; }
    th { background: #f4f4f4; }
    .summary-row { display: flex; justify-content: space-between; padding: 8px 4px; border-bottom: 1px solid #eee; }
    .summary-row.total-row { font-weight: 700; background: #fafafa; }
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
    }
  </style>
</head>
<body>
  <h1>דוח מע"מ</h1>

  <div class="section business-info">
    <h2>פרטי העסק</h2>
    <p><strong>שם העסק:</strong> ${this.escapeHtml(businessName)}</p>
    <p><strong>מספר עוסק:</strong> ${this.escapeHtml(businessNum)}</p>
    ${businessAddress ? `<p><strong>כתובת:</strong> ${this.escapeHtml(businessAddress)}</p>` : ''}
    <p><strong>תקופת הדוח:</strong> ${this.escapeHtml(period)}</p>
  </div>

  <div class="section">
    <h2>סיכום הדוח</h2>
    ${summaryHtml}
  </div>

  ${expensesSection}

  <div class="pdf-footer">${this.escapeHtml(this.PDF_FOOTER_TEXT)}</div>
</body>
</html>`;

    // Use a hidden iframe (rather than a new window) so the browser's
    // print dialog shows the parent app URL in its auto-injected header/
    // footer instead of "about:blank". The iframe is removed after print.
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

    // Defer print so the iframe document finishes layout (fonts/RTL) before
    // the print dialog snapshots it. After the dialog closes (or after a
    // safety timeout) the iframe is removed.
    setTimeout(() => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      win.focus();
      // onafterprint fires after the user closes / confirms the dialog.
      win.onafterprint = () => setTimeout(cleanup, 0);
      win.print();
      // Safety net — if onafterprint doesn't fire (older browsers), drop
      // the iframe after a generous delay.
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

  onDeleteFile(row: IRowDataTable): void {
    this.filesService.deleteFileCompletely(row.id as number, row.file as string)
      .pipe(
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'קובץ נמחק בהצלחה',
            life: 5000,
            key: 'br'
          });
          this.getDataTable(this.startDate(), this.endDate(), this.businessNumber());
        }),
        catchError((error) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'שגיאה במחיקת הקובץ, אנא נסה/י שנית',
            life: 5000,
            key: 'br'
          });
          console.error("Error deleting file:", error);
          return of(null);
        }),
        finalize(() => {
          this.genericService.dismissLoader();
        })
      )
      .subscribe();
  }

  onDownloadFile(row: IRowDataTable): void {
    console.log("Download file for row:", row);
    this.filesService.downloadFirebaseFile(row.file as string)
  }

  private setFileActions(): void {
    this.fileActions = [
      {
        name: 'preview',
        icon: 'pi pi-eye',
        title: 'צפה בקובץ',
        action: (event: any, row: IRowDataTable) => {
          this.onPreviewFileClicked(row);
        }
      },
      {
        name: 'download',
        icon: 'pi pi-download',
        title: 'הורד קובץ',
        action: (event: any, row: IRowDataTable) => {
          this.onDownloadFile(row);
        }
      },
      {
        name: 'edit',
        icon: 'pi pi-pencil',
        title: 'ערוך קובץ (החלף)',
        action: (fileInput: HTMLInputElement, row: IRowDataTable) => {
          this.confirmationService.confirm({
            message: 'האם אתה בטוח שאתה רוצה להחליף את הקובץ הקיים?',
            header: 'החלפת קובץ',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'החלף',
            rejectLabel: 'לא',
            accept: () => {
              fileInput.value = '';
              fromEvent(fileInput, 'change').pipe(
                take(1),
                map(() => fileInput.files?.[0] || null),
                filter((file): file is File => !!file)
              )
                .subscribe((file) => {
                  this.addFileToExpense({ row, file });
                });

              fileInput.click();
            },
            reject: () => { }
          });
        }
      },
      {
        name: 'delete',
        icon: 'pi pi-trash',
        title: 'מחק קובץ',
        action: (event: any, row: IRowDataTable) => {
          this.confirmationService.confirm({
            message: 'האם אתה בטוח שאתה רוצה למחוק את הקובץ?',
            header: 'מחיקת קובץ',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'מחק',
            rejectLabel: 'לא',
            accept: () => {
              this.onDeleteFile(row);
            },
            reject: () => { }
          });
        }
      },
    ];
  }

}