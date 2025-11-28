import { Component, OnInit, signal, inject, viewChild } from '@angular/core';
import { EMPTY, fromEvent } from 'rxjs';
import { catchError, filter, finalize, map, take } from 'rxjs/operators';
import { DocumentsService } from 'src/app/services/documents.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IRowDataTable, ITableRowAction, IUserData } from 'src/app/shared/interface';
import {
  BusinessStatus,
  DocumentsTableColumns,
  DocumentsTableHebrewColumns,
  FormTypes
} from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { DateService } from 'src/app/services/date.service';
import { FilesService } from 'src/app/services/files.service';
import { DocTypeDisplayName, DocumentType } from '../../doc-create/doc-cerate.enum';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Popover } from 'primeng/popover';

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
  private fb = inject(FormBuilder);

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

  // Form managed by FilterTab
  form: FormGroup = this.fb.group({
    businessNumber: [null],
    docType: [null]
    // ❗ DO NOT add "period" here → FilterTab will create it automatically
  });

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
    { name: DocumentsTableColumns.RECIPIENT_NAME, value: DocumentsTableHebrewColumns.recipientName, type: FormTypes.TEXT },
    { name: DocumentsTableColumns.DOC_SUM, value: DocumentsTableHebrewColumns.sumAftDisWithVAT, type: FormTypes.NUMBER },
  ];
  showMiniMenu = signal(false);
  // Holds the selected row for download
  selectedRowForDownload = signal<IRowDataTable | null>(null);

  // ===========================
  // Filter config (used by FilterTab)
  // ===========================
  filterConfig: FilterField[] = [];


  // ===========================
  // Init
  // ===========================
  async ngOnInit() {

    this.setFileActions();

    this.userData = this.authService.getUserDataFromLocalStorage();
    this.businessStatus = this.userData.businessStatus;
    const businesses = this.gs.businesses();

    // 1️⃣ Set the signal
    this.selectedBusinessNumber.set(businesses[0].businessNumber);
    this.selectedBusinessName.set(businesses[0].businessName);

    // 2️⃣ Set the form initial value
    this.form.get('businessNumber')?.setValue(businesses[0].businessNumber);

    // 3️⃣ Now config can be set safely
    this.filterConfig = [
      {
        type: 'select',
        controlName: 'businessNumber',
        label: 'בחר עסק',
        required: true,
        options: this.gs.businessSelectItems
      },
      {
        type: 'period',
        controlName: 'period',
        required: true
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

    this.form.get('businessNumber')?.valueChanges.subscribe(businessNumber => {
      if (!businessNumber) return;

      const business = this.gs.businesses().find(
        b => b.businessNumber === businessNumber
      );

      this.selectedBusinessName.set(business?.businessName ?? '');

      // Auto-fetch only when business changes
      this.fetchDocuments(businessNumber);
    });

    // 5️⃣ Fetch initial data
    this.fetchDocuments(this.selectedBusinessNumber());
  }


  // ===========================
  // Handle filter submit
  // ===========================
  onSubmit(formValues: any): void {

    console.log("Submitted filter:", formValues);

    this.selectedBusinessNumber.set(formValues.businessNumber);

    // const businessNumber = formValues.businessNumber;
    const docType = formValues.docType;

    // period object
    const period = formValues.period;
    const {

      periodMode,
      year,
      month,
      startDate: localStartDate,
      endDate: localEndDate

    } = period;

    const { startDate, endDate } = this.dateService.getStartAndEndDates(
      periodMode,
      year,
      month,
      localStartDate,
      localEndDate
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
      return rows.map(row => ({
        ...row,
        sum: this.gs.addComma(Math.abs(row.sum as number)),
        docType: DocTypeDisplayName[row.docType] ?? row.docType,
      }));
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
          // this.showDownloadMenu(event, row);
          // this.onDownloadFile(row);
          this.openDownloadMenu(row);
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


  // onDownloadFile(row: IRowDataTable): void {
  //   console.log("Download file for row:", row);
  //   this.filesService.downloadFirebaseFile(row.file as string)
  // }
  
}