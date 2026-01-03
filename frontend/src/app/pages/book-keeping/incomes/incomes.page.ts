import { Component, OnInit, signal, inject } from '@angular/core';
import { EMPTY, of } from 'rxjs';
import { catchError, finalize, map, take } from 'rxjs/operators';
import { DocumentsService } from 'src/app/services/documents.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IRowDataTable, ITableRowAction, IUserData } from 'src/app/shared/interface';
import {
  BusinessStatus,
  BusinessType,
  DocumentsTableColumns,
  DocumentsTableHebrewColumns,
  FormTypes,
  ReportingPeriodType
} from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { DateService } from 'src/app/services/date.service';
import { FilesService } from 'src/app/services/files.service';
import { DocTypeDisplayName, DocumentType } from '../../doc-create/doc-cerate.enum';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { Router } from '@angular/router';

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
  private dateService = inject(DateService);
  private documentsService = inject(DocumentsService);
  private filesService = inject(FilesService);
  private confirmationService = inject(ConfirmationService);
  private fb = inject(FormBuilder);
  private router = inject(Router);

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

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

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
        periodDefaults: {
          year: currentYear,
        }
      },
      {
        type: 'select',
        controlName: 'docType',
        label: 'סוג מסמך',
        options: [
          { name: 'חשבונית מס', value: DocumentType.TAX_INVOICE },
          { name: 'קבלה', value: DocumentType.RECEIPT },
          { name: 'חשבונית זיכוי', value: DocumentType.CREDIT_INVOICE }
        ]
      }
    ];

    // 5️⃣ Fetch initial data
    this.fetchDocuments(this.selectedBusinessNumber());
  }


  // ===========================
  // Handle filter submit
  // ===========================
  onSubmit(formValues: any): void {

    console.log("Submitted filter:", formValues);

    this.selectedBusinessNumber.set(formValues.businessNumber);

    const docType = formValues.docType;

    const { startDate, endDate } = this.dateService.getStartAndEndDates(
      formValues.periodMode,
      formValues.year,
      formValues.month,
      formValues.startDate,
      formValues.endDate
    );

    this.startDate = startDate;
    this.endDate = endDate;

    this.fetchDocuments(this.selectedBusinessNumber(), startDate, endDate, docType);
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
        
        return {
        ...row,
        sum: this.gs.addComma(Math.abs(row.sum as number)),
        docType: DocTypeDisplayName[row.docType] ?? row.docType,
        docStatus: row.docStatus?.toUpperCase() === 'OPEN'  ? 'פתוח' : row.docStatus?.toUpperCase() === 'CLOSE' ? 'סגור' : '',
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
    ]);
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
            this.redirectToOppositeDoc(row, DocumentType.CREDIT_INVOICE, true);
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
            this.redirectToOppositeDoc(row, DocumentType.CREDIT_INVOICE, true);
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
            this.redirectToOppositeDoc(row, DocumentType.RECEIPT);
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


  private redirectToOppositeDoc(row: IRowDataTable, oppositeDocType: DocumentType, isNegativeReceipt: boolean = false) {
    const businessNumber = this.selectedBusinessNumber();
    
    // Find the original docType enum from the Hebrew name
    const hebrewDocType = row.docType as string;
    console.log("🔥 redirectToOppositeDoc - hebrewDocType:", hebrewDocType);
    
    // Check if row.docType is already an enum value
    let originalDocType: DocumentType | null = null;
    if (Object.values(DocumentType).includes(hebrewDocType as DocumentType)) {
      // Already an enum value
      originalDocType = hebrewDocType as DocumentType;
      console.log("🔥 redirectToOppositeDoc - docType is already enum:", originalDocType);
    } else {
      // Try to find enum from Hebrew name
      const originalDocTypeEntry = Object.entries(DocTypeDisplayName).find(
        ([_, name]) => name === hebrewDocType
      );
      originalDocType = originalDocTypeEntry ? (originalDocTypeEntry[0] as DocumentType) : null;
      console.log("🔥 redirectToOppositeDoc - found enum from Hebrew name:", originalDocType);
    }
    
    // Try to fetch lines; if fails, navigate with base payload
    const docNumber = (row as any)?.docNumber ?? (row as any)?.doc_number;
    console.log("🔥 redirectToOppositeDoc - docNumber:", docNumber);
    
    const basePayload = {
      docType: oppositeDocType,
      sourceDoc: {
        ...row,
        docType: originalDocType, // Use enum if found, otherwise null (will be handled in prefillFromOppositeDoc)
        docTypeName: hebrewDocType, // Keep Hebrew name for display
        docNumber: docNumber ? String(docNumber) : undefined, // Add docNumber if it exists
      },
      businessNumber,
      businessName: this.selectedBusinessName(),
      isNegativeReceipt, // Pass the flag to indicate if this is a negative receipt
    };
    
    console.log("🔥 redirectToOppositeDoc - basePayload.sourceDoc:", basePayload.sourceDoc);
    
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

  // /**
  //  * Resolve opposite doc type/label, including business-type rules for חשבון עסקה.
  //  */
  // private getOppositeDoc(row: IRowDataTable): { docType: DocumentType; label: string } | undefined {
    
  //   const docTypeKey = typeof row.docType === 'string' ? row.docType : String(row.docType ?? '');

  //   if (docTypeKey === 'חשבון עסקה') {
  //     const businessType = this.getSelectedBusinessType();
  //     const isExempt = businessType === BusinessType.EXEMPT;
  //     return {
  //       docType: isExempt ? DocumentType.RECEIPT : DocumentType.TAX_INVOICE_RECEIPT,
  //       label: isExempt ? 'קבלה' : 'חשבונית מס קבלה',
  //     };
  //   }

  //   return this.oppositeDocMap[docTypeKey];
  // }


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
   */
  private updateDocStatusToClose(row: IRowDataTable): void {
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
        return EMPTY;
      })
    ).subscribe(() => {
      console.log('Document status updated to CLOSE');
      // Refresh the documents list
      this.fetchDocuments(businessNumber, this.startDate, this.endDate);
    });
  }

  
}