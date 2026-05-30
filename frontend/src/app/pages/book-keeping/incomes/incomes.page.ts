import { Component, OnInit, signal, inject } from '@angular/core';
import { EMPTY, of } from 'rxjs';
import { catchError, finalize, map, take } from 'rxjs/operators';
import { DocumentsService } from 'src/app/services/documents.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IMobileCardConfig, IRowDataTable, ITableRowAction, IUserData } from 'src/app/shared/interface';
import {
  BusinessStatus,
  BusinessType,
  DocumentsTableColumns,
  DocumentsTableHebrewColumns,
  FormTypes,
  ReportingPeriodType,
  getAllocationNumberThreshold,
} from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { FilesService } from 'src/app/services/files.service';
import { DocTypeDisplayName, DocumentType } from '../../doc-create/doc-cerate.enum';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Router } from '@angular/router';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { DialogService } from 'primeng/dynamicdialog';
import { DocSuccessDialogComponent } from 'src/app/components/create-doc-success-dialog/create-doc-success-dialog.component';

// Israeli Tax Authority page where the user manually requests an allocation number.
const TAX_AUTHORITY_ALLOCATION_URL = 'https://www.gov.il/he/service/request-assignment-number-for-tax-invoice';

const PENDING_ALLOCATION_STATUS = 'PENDING_ALLOCATION';

@Component({
  selector: 'app-incomes',
  templateUrl: './incomes.page.html',
  styleUrls: ['./incomes.page.scss', '../../../shared/shared-styling.scss'],
  standalone: false
})
export class IncomesPage implements OnInit {

  // ===========================
  // Inject services
  // ===========================
  private gs = inject(GenericService);
  private authService = inject(AuthService);
  private documentsService = inject(DocumentsService);
  private filesService = inject(FilesService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private dialogService = inject(DialogService);

  // For the allocation-number entry dialog
  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  showAllocationInputDialog = signal<boolean>(false);
  allocationInputValue = '';
  // Exposed as a signal so the dialog template can show the doc's details
  // (recipient id, sum before VAT, date, doc #/type) — they're what the user
  // needs to paste into the Tax Authority site to fetch the allocation #.
  pendingFinalizeRow = signal<IRowDataTable | null>(null);

  // ===========================
  // Global state
  // ===========================
  userData!: IUserData;

  // Business related
  selectedBusinessNumber = signal<string>("");
  selectedBusinessName = signal<string>("");
  BusinessStatus = BusinessStatus;
  businessStatus: BusinessStatus = BusinessStatus.SINGLE_BUSINESS;
  businessOptions = this.gs.businessSelectItems;

  startDate!: string;
  endDate!: string;

  isLoadingDataTable = signal<boolean>(false);
  myDocuments: any;
  fileActions = signal<ITableRowAction[]>([]);

  mobileCardConfig: IMobileCardConfig = {
    primaryFields: [DocumentsTableColumns.DOC_TYPE],
    highlightedField: DocumentsTableColumns.DOC_SUM,
    dateField: DocumentsTableColumns.DOC_DATE,
    hiddenFields: [],
  };


  // ===========================
  // Table config
  // ===========================
  documentsTableFields: IColumnDataTable<DocumentsTableColumns, DocumentsTableHebrewColumns>[] = [
    { name: DocumentsTableColumns.DOC_DATE, value: DocumentsTableHebrewColumns.docDate, type: FormTypes.DATE },
    { name: DocumentsTableColumns.DOC_TYPE, value: DocumentsTableHebrewColumns.docType, type: FormTypes.TEXT },
    { name: DocumentsTableColumns.DOC_NUMBER, value: DocumentsTableHebrewColumns.docNumber, type: FormTypes.TEXT },
    { name: DocumentsTableColumns.PARENT_DOC, value: DocumentsTableHebrewColumns.parentDoc, type: FormTypes.TEXT },
    { name: DocumentsTableColumns.RECIPIENT_NAME, value: DocumentsTableHebrewColumns.recipientName, type: FormTypes.TEXT },
    { name: DocumentsTableColumns.DOC_SUM, value: DocumentsTableHebrewColumns.sumAftDisWithVAT, type: FormTypes.NUMBER },
    { name: DocumentsTableColumns.DOC_STATUS, value: DocumentsTableHebrewColumns.docStatus, type: FormTypes.TEXT },
  ];
  showMiniMenu = signal(false);
  // Holds the selected row for download
  selectedRowForDownload = signal<IRowDataTable | null>(null);

  // Mapping of original doc → opposite doc type + label
  private oppositeDocMap: Record<string, { docType: DocumentType; label: string }> = {
    'חשבונית מס': { docType: DocumentType.CREDIT_INVOICE, label: 'חשבונית זיכוי' },
    'חשבון עסקה': { docType: DocumentType.RECEIPT, label: 'קבלה' }, // default; overridden by business type
  };

  // Mapping of original doc → opposite doc type + label
  private closeDocMap: Record<string, { docType: DocumentType; label: string }> = {
    'חשבונית מס': { docType: DocumentType.RECEIPT, label: 'קבלה' },
    'חשבון עסקה': { docType: DocumentType.TAX_INVOICE_RECEIPT, label: 'חשבונית מס קבלה' }, // default; overridden by business type
  };

  // ===========================
  // Filter config (used by FilterTab)
  // ===========================
  form: FormGroup = this.fb.group({});
  filterConfig: FilterField[] = [];


  // ===========================
  // Init
  // ===========================
  async ngOnInit() {

    this.setFileActions();

    this.userData = this.authService.getUserDataFromLocalStorage();
    this.businessStatus = this.userData.businessStatus;
    const businesses = this.gs.businesses();
    this.selectedBusinessNumber.set(businesses[0].businessNumber);
    this.selectedBusinessName.set(businesses[0].businessName);

    // Create the form with essential controls early
    this.form = this.fb.group({
      businessNumber: [this.selectedBusinessNumber()],
    });

    this.form.get('businessNumber')?.valueChanges.subscribe(businessNumber => {
      if (!businessNumber) return;

      const business = this.gs.businesses().find(
        b => b.businessNumber === businessNumber
      );

      this.selectedBusinessNumber.set(business?.businessNumber ?? '');
      this.selectedBusinessName.set(business?.businessName ?? '');

      console.log("Change: business number is ", this.selectedBusinessNumber());
      

      // Auto-fetch only when business changes
      this.fetchDocuments(this.selectedBusinessNumber());
    });

    const currentYear = new Date().getFullYear();

    this.filterConfig = [
      {
        type: 'select',
        controlName: 'businessNumber',
        label: 'בחר עסק',
        required: true,
        options: this.gs.businessSelectItems,
        defaultValue: this.selectedBusinessNumber()
      },
      {
        type: 'period',
        controlName: 'period',
        required: true,
        allowedPeriodModes: [ReportingPeriodType.MONTHLY, ReportingPeriodType.BIMONTHLY, ReportingPeriodType.ANNUAL, ReportingPeriodType.DATE_RANGE],
        periodDefaults: this.gs.getDefaultPeriodConfig({ year: currentYear })
      },
      {
        type: 'select',
        controlName: 'docType',
        label: 'סוג מסמך',
        // Derived from the enum so every issued document type is filterable —
        // the hardcoded subset omitted חשבונית מס קבלה / חשבון עסקה, which made
        // the filter return nothing for documents of those (very common) types.
        options: Object.values(DocumentType).map((t) => ({
          name: DocTypeDisplayName[t] ?? t,
          value: t,
        }))
      }
    ];

    // 5️⃣ Fetch initial data
    this.fetchDocuments(this.selectedBusinessNumber());

    // 6️⃣ If we got here from the doc-create "Get from tax authority" flow,
    // auto-open the allocation-input dialog populated with the just-saved
    // doc's details. (Snapshot is passed via navigation state.)
    const nav = this.router.getCurrentNavigation();
    const fromHistory = (history.state ?? {}) as { autoOpenAllocationFor?: any };
    const autoOpenRow = nav?.extras?.state?.['autoOpenAllocationFor'] ?? fromHistory.autoOpenAllocationFor;
    if (autoOpenRow) {
      this.pendingFinalizeRow.set(autoOpenRow as IRowDataTable);
      this.allocationInputValue = '';
      this.showAllocationInputDialog.set(true);
      // Clear it so a normal refresh of this page doesn't reopen the dialog.
      if (history.replaceState) {
        const { autoOpenAllocationFor, ...rest } = history.state ?? {};
        history.replaceState(rest, '');
      }
    }
  }

  // Exposed to the template for the "Open Tax Authority site" link.
  readonly taxAuthorityUrl = TAX_AUTHORITY_ALLOCATION_URL;


  // ===========================
  // Handle filter submit
  // ===========================
  onSubmit(formValues: any): void {
    const effectiveBusiness = this.gs.getEffectiveBusinessNumber(this.form, formValues.businessNumber, this.userData);
    const { startDate, endDate } = this.gs.getPeriodDatesFromForm(this.form);

    this.selectedBusinessNumber.set(effectiveBusiness);
    this.startDate = startDate;
    this.endDate = endDate;
    this.fetchDocuments(effectiveBusiness, startDate, endDate, formValues.docType);
  }


  // ===========================
  // Fetch documents from server
  // ===========================
  fetchDocuments(
    businessNumber: string,
    startDate?: string,
    endDate?: string,
    docType?: string
  ): void {

    console.log("fetchDocuments →", { businessNumber, startDate, endDate, docType });

    this.isLoadingDataTable.set(true);

    this.myDocuments = this.documentsService
  .getDocuments(businessNumber, startDate, endDate, docType)
  .pipe(
    map((rows: any[]) => {
      console.log("📄 Documents fetched:", rows); // 👈 REAL PRINT HERE
      return rows.map(row => {
        // Format parent document: type + number (if exists)
        // Use HTML with <br> for multi-line display
        let parentDoc = '';
        if (row.parentDocType && row.parentDocNumber) {
          const parentDocTypeName = DocTypeDisplayName[row.parentDocType] ?? row.parentDocType;
          parentDoc = `${parentDocTypeName}<br>${row.parentDocNumber}`;
        }
        
        // Format sum: add "ש"ח" and handle negative sign on the right for RTL
        // The column name is 'sumAftDisWithVAT' (from DocumentsTableColumns.DOC_SUM)
        const sumValue = row.sumAftDisWithVAT as number;
        const isNegative = sumValue < 0;
        const absValue = Math.abs(sumValue);
        const formattedSum = this.gs.addComma(absValue);
        // For negative numbers in RTL: put minus on the right, e.g., "123- ש"ח"
        const sumWithCurrency = isNegative 
          ? `${formattedSum}-`
          : `${formattedSum}`;
        
        const rawStatus = row.docStatus?.toUpperCase();
        let statusLabel = '';
        if (rawStatus === 'OPEN') statusLabel = 'פתוח';
        else if (rawStatus === 'CLOSE') statusLabel = 'סגור';
        else if (rawStatus === PENDING_ALLOCATION_STATUS) statusLabel = '⚠️ ממתין למספר הקצאה';

        return {
        ...row,
        sumAftDisWithVAT: sumWithCurrency, // Update the field that matches the column name
        docType: DocTypeDisplayName[row.docType] ?? row.docType,
        docTypeOriginal: row.docType, // raw enum, preserved for action handlers
        docStatus: statusLabel,
          docStatusOriginal: row.docStatus, // Keep original value for conditional checks
          parentDoc: parentDoc, // Add parent doc formatted string with HTML
        };
      });
    }),
    catchError(err => {
      console.error("Error fetching documents:", err);
      return EMPTY;
    }),
    finalize(() => this.isLoadingDataTable.set(false))
  );


    // this.myDocuments = this.documentsService
    //   .getDocuments(businessNumber, startDate, endDate, docType)
    //   .pipe(
    //     catchError(err => {
    //       console.error('Error fetching documents:', err);
    //       return EMPTY;
    //     }),
    //     finalize(() => this.isLoadingDataTable.set(false)),
    //     map((rows: any[]) =>
    //       rows.map(row => ({
    //         ...row,
    //         sum: this.gs.addComma(Math.abs(row.sum as number)),
    //       }))
    //     )
    //   )

  }


  private setFileActions(): void {
    const isTaxInvoiceType = (row: IRowDataTable) => {
      const rawType = (row as any)?.docTypeOriginal ?? (row as any)?.docType;
      return rawType === DocumentType.TAX_INVOICE
          || rawType === DocumentType.TAX_INVOICE_RECEIPT;
    };

    const isPending = (row: IRowDataTable) => {
      const rawStatus = (row as any)?.docStatusOriginal ?? (row as any)?.docStatus;
      return rawStatus === PENDING_ALLOCATION_STATUS;
    };

    // "Get allocation # from tax authority" should appear whenever a tax
    // invoice / tax-invoice-receipt needs an allocation number — either it
    // was explicitly saved as PENDING_ALLOCATION, OR it was issued above the
    // threshold without one (so the recipient currently can't reclaim VAT
    // and the user might want to attach one retroactively).
    const needsAllocationNumber = (row: IRowDataTable) => {
      if (!isTaxInvoiceType(row)) return false;
      if (isPending(row)) return true;
      const r = row as any;
      const sumBeforeVat = Number(r?.sumAftDisBefVAT ?? 0);
      const hasAllocationNum = !!(r?.allocationNum && String(r.allocationNum).trim());
      // Threshold depends on the doc's date (steps down over time per the
      // VAT-reform schedule in getAllocationNumberThreshold).
      return sumBeforeVat > getAllocationNumberThreshold(r?.docDate) && !hasAllocationNum;
    };

    // "Issue without allocation #" only makes sense while the doc is still
    // pending — once it's already issued (OPEN/CLOSE), this action is a no-op.
    const canFinalizeWithoutAllocation = (row: IRowDataTable) =>
      isTaxInvoiceType(row) && isPending(row);

    // Original actions — always visible (behavior unchanged by the allocation
    // feature). On pending-allocation rows the PDF doesn't exist yet, so the
    // download/preview buttons will surface a "file missing" path; that's
    // acceptable per product decision.
    this.fileActions.set([
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
          this.openDownloadMenu(row);
        }
      },
      {
        name: 'cancel',
        icon: 'pi pi-times',
        title: 'ביטול',
        action: (event: any, row: IRowDataTable) => {
          this.cancelDoc(row);
        }
      },
      {
        name: 'close',
        icon: 'pi pi-lock',
        title: 'הפק מסמך נגדי',
        action: (event: any, row: IRowDataTable) => {
          this.closeDoc(row);
        }
      },

      // ── Pending-allocation actions (visible only when the doc is awaiting
      // a decision about its allocation number). ──
      {
        name: 'get-allocation-from-tax',
        icon: 'pi pi-external-link',
        title: 'קבל מספר הקצאה מרשות המיסים',
        alwaysShow: true,
        showWhen: needsAllocationNumber,
        // Opens the Tax Authority page in a new tab AND surfaces the input
        // dialog so the user can paste the number when they come back.
        action: (_event: any, row: IRowDataTable) => this.getAllocationFromTaxAuthority(row),
      },
      {
        name: 'finalize-no-allocation',
        icon: 'pi pi-check',
        title: 'הפק ללא מספר הקצאה',
        alwaysShow: true,
        showWhen: canFinalizeWithoutAllocation,
        action: (_event: any, row: IRowDataTable) => this.finalizeWithoutAllocation(row),
      },
      // TODO: re-enable when SHAAM auto-flow is wired up.
      // {
      //   name: 'request-allocation-auto',
      //   icon: 'pi pi-bolt',
      //   title: 'בקש מספר הקצאה אוטומטית (שעמ)',
      //   alwaysShow: true,
      //   showWhen: isPending,
      //   action: (_event: any, row: IRowDataTable) => this.requestAllocationAutomatically(row),
      // },
    ]);
  }


  // -----------------------------------------------------
  // Allocation-number finalize handlers
  // -----------------------------------------------------

  /** Resolve the raw DocumentType enum from a row (handles Hebrew-display case). */
  private resolveDocType(row: IRowDataTable): DocumentType | null {
    const preserved = (row as any).docTypeOriginal;
    if (preserved && Object.values(DocumentType).includes(preserved)) {
      return preserved as DocumentType;
    }
    const hebrewDocType = row.docType as string;
    if (Object.values(DocumentType).includes(hebrewDocType as DocumentType)) {
      return hebrewDocType as DocumentType;
    }
    const entry = Object.entries(DocTypeDisplayName).find(([, name]) => name === hebrewDocType);
    return entry ? (entry[0] as DocumentType) : null;
  }

  /**
   * Opens the Tax Authority allocation-request page in a new tab and, in the
   * same step, surfaces the input dialog so the user can paste the number
   * back into our app once they have it.
   */
  getAllocationFromTaxAuthority(row: IRowDataTable): void {
    // Don't redirect to the Tax Authority automatically — the dialog opens
    // with a clickable link the user follows on their own pace.
    this.pendingFinalizeRow.set(row);
    this.allocationInputValue = '';
    this.showAllocationInputDialog.set(true);
  }

  // TODO: re-enable when SHAAM auto-flow is wired up.
  // private requestAllocationAutomatically(row: IRowDataTable): void {
  //   // Will call the SHAAM service to request an allocation number on the
  //   // user's behalf, then call finalizeAllocation with the returned number.
  // }

  cancelAllocationInputDialog(): void {
    this.pendingFinalizeRow.set(null);
    this.allocationInputValue = '';
    this.showAllocationInputDialog.set(false);
  }

  submitAllocationInputDialog(): void {
    const value = this.allocationInputValue?.trim();
    const row = this.pendingFinalizeRow();
    if (!value || !row) return;
    this.showAllocationInputDialog.set(false);
    this.callFinalize(row, value);
  }

  finalizeWithoutAllocation(row: IRowDataTable): void {
    this.confirmationService.confirm({
      message: 'האם אתה בטוח שברצונך להפיק את המסמך ללא מספר הקצאה?<br>הלקוח שלך לא יוכל לקזז את המע״מ.',
      header: 'אישור הפקה ללא מספר הקצאה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן, הפק ללא מספר הקצאה',
      rejectLabel: 'ביטול',
      acceptVisible: true,
      rejectVisible: true,
      // Match the project's design system (BLACK buttons) instead of PrimeNG's
      // default green/danger. `p-button-contrast` is the dark variant in v19.
      acceptButtonStyleClass: 'p-button-contrast',
      rejectButtonStyleClass: 'p-button-contrast',
      accept: () => this.callFinalize(row, null),
    });
  }

  private callFinalize(row: IRowDataTable, allocationNum: string | null): void {
    // Prefer the row's own issuerBusinessNumber when present — it survives
    // navigations (e.g. coming from doc-create with another business
    // selected) better than the page-level selectedBusinessNumber.
    const businessNumber = ((row as any).issuerBusinessNumber as string) || this.selectedBusinessNumber();
    const docNumber = ((row as any).docNumber ?? (row as any).doc_number)?.toString();
    const docType = this.resolveDocType(row);
    if (!businessNumber || !docNumber || !docType) {
      console.error('finalizeAllocation: missing identifiers', { businessNumber, docNumber, docType });
      this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'לא ניתן לזהות את המסמך', life: 4000, key: 'br' });
      return;
    }

    // Show the global loader (same UX as the regular create flow).
    this.gs.getLoader().subscribe();
    this.gs.updateLoaderMessage('מפיק את המסמך, אנא המתן...');

    this.documentsService.finalizeAllocation(businessNumber, docNumber, docType, allocationNum)
      .pipe(
        take(1),
        finalize(() => this.gs.dismissLoader()),
        catchError(err => {
          console.error('finalizeAllocation failed', err);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: err?.error?.message || 'הפקת המסמך נכשלה. נסה שנית.',
            life: 5000,
            key: 'br',
          });
          return EMPTY;
        }),
      )
      .subscribe((response: any) => {
        this.pendingFinalizeRow.set(null);
        this.allocationInputValue = '';

        // Same success dialog as the regular create flow — gives the user the
        // doc number + download links for the freshly-generated PDFs.
        if (response?.docNumber) {
          this.dialogService.open(DocSuccessDialogComponent, {
            header: '',
            width: '400px',
            data: {
              docNumber: response.docNumber,
              file: response.file,
              copyFile: response.copyFile,
              docType: DocTypeDisplayName[response.docType as DocumentType] ?? response.docType,
            },
          });
        }

        this.fetchDocuments(businessNumber, this.startDate, this.endDate);
      });
  }


  // -----------------------------------------------------
  // Called when user clicks the download icon in the table
  // -----------------------------------------------------
  openDownloadMenu(row: IRowDataTable) {
    console.log("🔥 openDownloadMenu fired!", row);
    this.selectedRowForDownload.set(row);
    this.showMiniMenu.set(true);
  }

  // -----------------------------------------------------
  // Original file download
  // -----------------------------------------------------
  downloadOriginal() {
    const row = this.selectedRowForDownload();
    if (!row?.file) {
      console.error("Original file missing on row:", row);
      return;
    }

    this.filesService.downloadFirebaseFile(row.file as string);
    this.showMiniMenu.set(false);
  }

  // -----------------------------------------------------
  // Copy file download
  // -----------------------------------------------------
  downloadCopy() {
    const row = this.selectedRowForDownload();
    if (!row?.copyFile) {
      console.error("Copy file missing on row:", row);
      return;
    }

    this.filesService.downloadFirebaseFile(row.copyFile as string);
    this.showMiniMenu.set(false);
  }


  onPreviewFileClicked(expense: IRowDataTable): void {
    if (!(expense.file === undefined || expense.file === "" || expense.file === null)) {
      this.filesService.previewFile(expense.file as string).subscribe();

    }
    else {
      alert("לא נשמר קובץ עבור הוצאה זו")
    }
  }


  // -----------------------------------------------------
  // Called when user clicks the cancel icon in the table
  // -----------------------------------------------------
  cancelDoc(row: IRowDataTable): void {

    console.log("cancelDoc is called: row.docType is ", row.docType, "type of row.docType is ", typeof row.docType);

    const docType = typeof row.docType === 'string' ? row.docType : String(row.docType ?? '');
    const docStatus = (row as any)?.docStatusOriginal?.toUpperCase();

    switch (docType) {
      case 'חשבון עסקה':
        // Check if document is already closed
        if (docStatus === 'CLOSE') {
          this.confirmationService.confirm({
            message: 'המסמך כבר סגור.',
            header: 'סגירת מסמך',
            icon: 'pi pi-info-circle',
            rejectLabel: 'סגור',
            acceptVisible: false,
          });
          break;
        }
        this.confirmationService.confirm({
          message: 'לא ניתן לבטל מסמך שהופק.<br>האם ברצונך לסמן את המסמך כסגור?',
          header: 'ביטול מסמך',
          icon: 'pi pi-exclamation-triangle',
          acceptLabel: 'כן, סמן כסגור',
          rejectLabel: 'ביטול',
          accept: () => {
            this.updateDocStatusToClose(row);
          },
          reject: () => {
            console.log("User cancelled status update.");
          }
        });
        break;

      case 'קבלה':
        this.confirmationService.confirm({
          message: 'לא ניתן לבטל מסמך שהופק.<br>במידת הצורך, ניתן להפיק קבלה במינוס לצורך תיקון או החזרת תשלום',
          header: 'ביטול מסמך',
          icon: 'pi pi-exclamation-triangle',
          acceptLabel: 'הפק קבלה במינוס',
          rejectLabel: 'ביטול',
          acceptVisible: true,
          accept: () => {
            this.redirectToOppositeDoc(row, DocumentType.RECEIPT, true); // true = isNegativeReceipt
          },
          reject: () => {
            console.log("User cancelled negative receipt creation.");
          }
        });
        break;

      case 'חשבונית מס':
        this.confirmationService.confirm({
          message: 'לא ניתן לבטל מסמך שהופק.<br>במידת הצורך, ניתן להפיק חשבונית זיכוי לצורך תיקון או החזרת תשלום',
          header: 'ביטול מסמך',
          icon: 'pi pi-exclamation-triangle',
          acceptLabel: 'הפק חשבונית זיכוי',
          rejectLabel: 'ביטול',
          acceptVisible: true,
          accept: () => {
            this.redirectToOppositeDoc(row, DocumentType.CREDIT_INVOICE, false);
          },
          reject: () => {
            console.log("User cancelled negative receipt creation.");
          }
        });
        break;

      case 'חשבונית מס קבלה':
        this.confirmationService.confirm({
          message: 'לא ניתן לבטל מסמך שהופק.<br>במידת הצורך, יש להפיק חשבונית זיכוי וקבלה במינוס לצורך תיקון או החזרת תשלום',
          header: 'ביטול מסמך',
          icon: 'pi pi-exclamation-triangle',
          acceptLabel: 'הפק חשבונית זיכוי',
          rejectLabel: 'ביטול',
          acceptVisible: true,
          accept: () => {
            this.redirectToOppositeDoc(row, DocumentType.CREDIT_INVOICE, false);
          },
          reject: () => {
            console.log("User cancelled negative receipt creation.");
          }
        });
        break;

      default:
        console.error(`סוג מסמך לא מזוהה: ${docType}`);
        throw new Error(`סוג מסמך לא מזוהה: ${docType}`);
    }

  }


   // -----------------------------------------------------
  // Called when user clicks the lock icon in the table
  // -----------------------------------------------------
  closeDoc(row: IRowDataTable): void {

    const businessType = this.getSelectedBusinessType();
    const isExempt = businessType === BusinessType.EXEMPT;
    const docType = typeof row.docType === 'string' ? row.docType : String(row.docType ?? '');
    const docStatus = (row as any)?.docStatusOriginal?.toUpperCase();

    // Check if document is already closed
    if (docStatus === 'CLOSE') {
      this.confirmationService.confirm({
        message: 'המסמך כבר סגור.',
        header: 'סגירת מסמך',
        icon: 'pi pi-info-circle',
        rejectLabel: 'סגור',
        acceptVisible: false,
      });
      return;
    }

    switch (docType) {

      case 'חשבון עסקה':
        if (isExempt) {
          this.confirmationService.confirm({
            message: 'האם ברצונך לסגור את המסמך עם קבלה?',
            header: 'סגירת מסמך',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'הפק קבלה',
            rejectLabel: 'ביטול',
            acceptVisible: true,
            rejectVisible: true,
            accept: () => {
              this.redirectToOppositeDoc(row, DocumentType.RECEIPT);
            },
            reject: () => {
              console.log("User cancelled status update.");
            }
          });
        } else {
          this.confirmationService.confirm({
            message: 'האם ברצונך לסגור את המסמך עם חשבונית מס קבלה?',
            header: 'סגירת מסמך',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'הפק חשבונית מס קבלה',
            rejectLabel: 'ביטול',
            acceptVisible: true,
            rejectVisible: true,
            accept: () => {
              this.redirectToOppositeDoc(row, DocumentType.TAX_INVOICE_RECEIPT);
            },
            reject: () => {
              console.log("User cancelled status update.");
            }
          });
        }
      break;

      case 'חשבונית מס':
        this.confirmationService.confirm({
          message: 'האם ברצונך לסגור את המסמך עם קבלה?',
          header: 'סגירת מסמך',
          icon: 'pi pi-exclamation-triangle',
          acceptLabel: 'הפק קבלה',
          rejectLabel: 'ביטול',
          acceptVisible: true,
          rejectVisible: true,
          accept: () => {
            // Navigate to create the opposite document
            // Status will be updated to CLOSE only after the closing document is successfully created
            this.redirectToOppositeDoc(row, DocumentType.RECEIPT, false, true); // true = shouldCloseParentDoc
          },
          reject: () => {
            console.log("User cancelled status update.");
          }
        });
      break;

      default:
        console.error(`סוג מסמך לא מזוהה: ${docType}`);
        throw new Error(`סוג מסמך לא מזוהה: ${docType}`);
    }
  }


  private redirectToOppositeDoc(row: IRowDataTable, oppositeDocType: DocumentType, isNegativeReceipt: boolean = false, shouldCloseParentDoc: boolean = false) {
    const businessNumber = this.selectedBusinessNumber();
    
    // Find the original docType enum from the Hebrew name
    const hebrewDocType = row.docType as string;
    
    // Check if row.docType is already an enum value
    let originalDocType: DocumentType | null = null;
    if (Object.values(DocumentType).includes(hebrewDocType as DocumentType)) {
      // Already an enum value
      originalDocType = hebrewDocType as DocumentType;
    } else {
      // Try to find enum from Hebrew name
      const originalDocTypeEntry = Object.entries(DocTypeDisplayName).find(
        ([_, name]) => name === hebrewDocType
      );
      originalDocType = originalDocTypeEntry ? (originalDocTypeEntry[0] as DocumentType) : null;
    }
    
    // Try to fetch lines; if fails, navigate with base payload
    const docNumber = (row as any)?.docNumber ?? (row as any)?.doc_number;
    
    // Extract only the fields we need from row, explicitly excluding generalDocIndex
    const { generalDocIndex, ...rowWithoutGeneralIndex } = row as any;
    
    const basePayload = {
      docType: oppositeDocType,
      sourceDoc: {
        ...rowWithoutGeneralIndex,
        docType: originalDocType, // Use enum if found, otherwise null (will be handled in prefillFromOppositeDoc)
        docTypeName: hebrewDocType, // Keep Hebrew name for display
        docNumber: docNumber ? String(docNumber) : undefined, // Add docNumber if it exists
        // Explicitly exclude generalDocIndex to prevent it from being used for the new document
        generalDocIndex: undefined,
      },
      businessNumber,
      businessName: this.selectedBusinessName(),
      isNegativeReceipt, // Pass the flag to indicate if this is a negative receipt
      shouldCloseParentDoc, // Flag to indicate if parent document should be closed after creation
    };
        
    if (!docNumber) {
      this.navigateToDocCreate(basePayload);
      return;
    }

    this.documentsService.getDocLines(businessNumber, String(docNumber))
      .pipe(
        take(1),
        catchError(err => {
          console.error('Failed to fetch doc lines, proceeding without them', err);
          return of(null);
        })
      )
      .subscribe(lines => {
        const payloadWithLines = lines ? { 
          ...basePayload, 
          sourceDoc: { 
            ...basePayload.sourceDoc, // Keep all fields from basePayload.sourceDoc
            linesData: lines 
          } 
        } : basePayload;
        this.navigateToDocCreate(payloadWithLines);
      });

    this.showMiniMenu.set(false);
  }

  private navigateToDocCreate(payload: any) {
    this.router.navigate(['/doc-create'], {
      state: { oppositeDocPayload: payload },
    });
  }




  private getOppositeDoc(row: IRowDataTable): { docType: DocumentType; label: string } | undefined {
    const docTypeKey = typeof row.docType === 'string' ? row.docType : String(row.docType ?? '');
    
    // Handle חשבון עסקה - depends on business type
    if (docTypeKey === 'חשבון עסקה') {
      const businessType = this.getSelectedBusinessType();
      const isExempt = businessType === BusinessType.EXEMPT;
      return {
        docType: isExempt ? DocumentType.RECEIPT : DocumentType.TAX_INVOICE_RECEIPT,
        label: isExempt ? 'קבלה' : 'חשבונית מס קבלה',
      };
    }
    
    // Handle חשבונית מס
    if (docTypeKey === 'חשבונית מס') {
      return {
        docType: DocumentType.CREDIT_INVOICE,
        label: 'חשבונית זיכוי',
      };
    }
    
    // Fallback for any other document types
    return undefined;
  }


  /**
  * Resolve close doc type/label, including business-type rules for חשבון עסקה.
  */
  private getCloseDoc(row: IRowDataTable): { docType: DocumentType; label: string } | undefined {
  
    const docTypeKey = typeof row.docType === 'string' ? row.docType : String(row.docType ?? '');

    if (docTypeKey === 'חשבון עסקה') {
      const businessType = this.getSelectedBusinessType();
      const isExempt = businessType === BusinessType.EXEMPT;
      return {
        docType: isExempt ? DocumentType.RECEIPT : DocumentType.TAX_INVOICE_RECEIPT,
        label: isExempt ? 'קבלה' : 'חשבונית מס קבלה',
      };
    }

    return this.oppositeDocMap[docTypeKey];
  }


  private getSelectedBusinessType(): BusinessType | null {
    const biz = this.gs.businesses().find(b => b.businessNumber === this.selectedBusinessNumber());
    return biz?.businessType ?? null;
  }

  /**
   * Update document status to CLOSE
   * @param row - The document row to update
   * @param onSuccess - Optional callback to execute after successful status update
   */
  private updateDocStatusToClose(row: IRowDataTable, onSuccess?: () => void): void {
    const businessNumber = this.selectedBusinessNumber();
    const docNumber = (row as any)?.docNumber ?? (row as any)?.doc_number;
    const hebrewDocType = row.docType as string;
    
    // Find the original docType enum from the Hebrew name
    let originalDocType: DocumentType | null = null;
    if (Object.values(DocumentType).includes(hebrewDocType as DocumentType)) {
      originalDocType = hebrewDocType as DocumentType;
    } else {
      const originalDocTypeEntry = Object.entries(DocTypeDisplayName).find(
        ([_, name]) => name === hebrewDocType
      );
      originalDocType = originalDocTypeEntry ? (originalDocTypeEntry[0] as DocumentType) : null;
    }

    if (!originalDocType || !docNumber) {
      console.error('Cannot update status: missing docType or docNumber', { originalDocType, docNumber });
      // If callback provided, still execute it even if update fails (for navigation flow)
      if (onSuccess) {
        onSuccess();
      }
      return;
    }

    this.documentsService.updateDocStatus(
      businessNumber,
      String(docNumber),
      originalDocType,
      'CLOSE'
    ).pipe(
      take(1),
      catchError(err => {
        console.error('Failed to update document status', err);
        alert('שגיאה בעדכון סטטוס המסמך');
        // If callback provided, still execute it even if update fails (for navigation flow)
        if (onSuccess) {
          onSuccess();
        }
        return EMPTY;
      })
    ).subscribe(() => {
      console.log('Document status updated to CLOSE');
      // Refresh the documents list
      this.fetchDocuments(businessNumber, this.startDate, this.endDate);
      // Execute callback if provided (e.g., navigate to create opposite document)
      if (onSuccess) {
        onSuccess();
      }
    });
  }

  
}