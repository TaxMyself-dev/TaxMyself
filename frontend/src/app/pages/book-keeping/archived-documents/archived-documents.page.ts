import { Component, OnInit, TemplateRef, computed, signal, inject, viewChild } from '@angular/core';
import { of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { DriveDocsService, ArchivedItem, RecordSource, ArchiveItemStatus } from 'src/app/services/drive-docs.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IMobileCardConfig, IRowDataTable, ITableRowAction, IUserData, ISelectItem } from 'src/app/shared/interface';
import { BusinessStatus, FormTypes } from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { FormBuilder, FormGroup } from '@angular/forms';

/** Hebrew labels for `ArchiveItemStatus` (see backend `src/enum.ts`). */
export const ARCHIVE_STATUS_LABELS: Record<ArchiveItemStatus, string> = {
  PENDING: 'ממתין לאישור',
  APPROVED: 'אושר',
  REJECTED: 'נדחה',
};

/** Hebrew labels for `RecordSource` (see backend `src/enum.ts`). */
export const RECORD_SOURCE_LABELS: Record<RecordSource, string> = {
  DRIVE: 'דרייב',
  MANUAL: 'ידני',
  OPEN_BANKING: 'בנקאות פתוחה',
  WHATSAPP: 'ווטסאפ',
};

/** Hebrew labels for `ExtractedDocumentType` (see backend `extracted-document.entity.ts`). */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  invoice: 'חשבונית',
  receipt: 'קבלה',
  tax_invoice_receipt: 'חשבונית מס קבלה',
  credit_invoice: 'חשבונית זיכוי',
  invoice_receipt_pair: 'חשבונית + קבלה',
  form_106: 'טופס 106',
  tax_form: 'אישור מס',
  contract: 'חוזה',
  unknown: 'לא ידוע',
};

/** Synthetic "document type" for EXPENSE rows — an expense with no underlying
 *  document (manual entry or a classified bank/card transaction; which one
 *  is already distinguished by the מקור העלאה column, not this one). */
const TRANSACTION_TYPE_VALUE = 'NO_DOCUMENT';
const TRANSACTION_TYPE_LABEL = 'הוצאה';

@Component({
  selector: 'app-archived-documents',
  templateUrl: './archived-documents.page.html',
  styleUrls: ['./archived-documents.page.scss', '../../../shared/shared-styling.scss'],
  standalone: false
})
export class ArchivedDocumentsPage implements OnInit {

  // ===========================
  // Inject services
  // ===========================
  private gs = inject(GenericService);
  private authService = inject(AuthService);
  private driveDocsService = inject(DriveDocsService);
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
  businessOptions = this.gs.businessSelectItems();

  isLoadingDataTable = signal<boolean>(false);
  rawItems = signal<ArchivedItem[]>([]);
  selectedStatus = signal<string>('');
  selectedDocumentType = signal<string>('');
  fileActions = signal<ITableRowAction[]>([]);

  readonly archiveStatusLabels = ARCHIVE_STATUS_LABELS;
  readonly recordSourceLabels = RECORD_SOURCE_LABELS;

  // Angular 19 signal-based view query — the status badge cell needs a
  // TemplateRef, which only exists after the view is initialized, so the
  // column list below is a computed() that re-derives once it resolves.
  private readonly statusTpl = viewChild<TemplateRef<any>>('statusTpl');

  // ===========================
  // Table config
  // ===========================
  mobileCardConfig: IMobileCardConfig = {
    primaryFields: ['name'],
    highlightedField: 'sourceLabel',
    dateField: 'uploadDate',
    hiddenFields: ['id', 'driveFileId', 'itemType', 'status', 'documentType'],
    highlightedValueFormat: 'plain'
  };

  readonly archivedDocsTableFields = computed<IColumnDataTable<string, string>[]>(() => [
    { name: 'name', value: 'שם המסמך / תנועה', type: FormTypes.TEXT },
    { name: 'documentTypeLabel', value: 'סוג מסמך', type: FormTypes.TEXT },
    { name: 'status', value: 'סטטוס', cellTemplate: this.statusTpl() },
    { name: 'uploadDate', value: 'תאריך העלאה', type: FormTypes.DATE },
    { name: 'sourceLabel', value: 'מקור העלאה', type: FormTypes.TEXT },
  ]);

  // Client-side filter over the fully-fetched per-business row set — mirrors
  // the small dataset size this page has always worked with (no pagination).
  readonly filteredItems = computed(() => {
    const status = this.selectedStatus();
    const docType = this.selectedDocumentType();
    return this.rawItems()
      .filter(item => !status || item.status === status)
      .filter(item => !docType || (item.documentType ?? TRANSACTION_TYPE_VALUE) === docType)
      .map(item => ({
        ...item,
        documentTypeLabel: item.documentType
          ? (DOCUMENT_TYPE_LABELS[item.documentType] ?? item.documentType)
          : TRANSACTION_TYPE_LABEL,
        sourceLabel: this.recordSourceLabels[item.source] ?? item.source,
        uploadDate: item.uploadDate ? item.uploadDate.slice(0, 10) : '-',
      }));
  });

  // ===========================
  // Filter config (used by FilterTab)
  // ===========================
  form: FormGroup = this.fb.group({});
  filterConfig: FilterField[] = [];

  private readonly statusOptions: ISelectItem[] = [
    { name: 'הכל', value: '' },
    { name: ARCHIVE_STATUS_LABELS.APPROVED, value: 'APPROVED' },
    { name: ARCHIVE_STATUS_LABELS.REJECTED, value: 'REJECTED' },
    { name: ARCHIVE_STATUS_LABELS.PENDING, value: 'PENDING' },
  ];

  private readonly documentTypeOptions: ISelectItem[] = [
    { name: 'הכל', value: '' },
    ...Object.entries(DOCUMENT_TYPE_LABELS).map(([value, name]) => ({ name, value })),
    { name: TRANSACTION_TYPE_LABEL, value: TRANSACTION_TYPE_VALUE },
  ];

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

    this.form = this.fb.group({
      businessNumber: [this.selectedBusinessNumber()],
      status: [''],
      documentType: [''],
    });

    this.form.get('businessNumber')?.valueChanges.subscribe(businessNumber => {
      if (!businessNumber) return;

      const business = this.gs.businesses().find(
        b => b.businessNumber === businessNumber
      );

      this.selectedBusinessNumber.set(business?.businessNumber ?? '');
      this.selectedBusinessName.set(business?.businessName ?? '');

      this.fetchArchivedItems(this.selectedBusinessNumber());
    });

    this.form.get('status')?.valueChanges.subscribe(value => this.selectedStatus.set(value ?? ''));
    this.form.get('documentType')?.valueChanges.subscribe(value => this.selectedDocumentType.set(value ?? ''));

    this.filterConfig = [
      ...(this.businessOptions.length > 1 ? [{
        type: 'select' as const,
        controlName: 'businessNumber',
        label: 'בחר עסק',
        required: true,
        options: this.businessOptions,
        defaultValue: this.selectedBusinessNumber(),
      }] : []),
      {
        type: 'select',
        controlName: 'status',
        label: 'סטטוס',
        options: this.statusOptions,
        defaultValue: '',
      },
      {
        type: 'select',
        controlName: 'documentType',
        label: 'סוג מסמך',
        options: this.documentTypeOptions,
        defaultValue: '',
      },
    ];

    this.fetchArchivedItems(this.selectedBusinessNumber());
  }

  // ===========================
  // Handle filter submit
  // ===========================
  onSubmit(formValues: any): void {
    if (formValues.businessNumber && formValues.businessNumber !== this.selectedBusinessNumber()) {
      const business = this.gs.businesses().find(
        b => b.businessNumber === formValues.businessNumber
      );
      this.selectedBusinessNumber.set(formValues.businessNumber);
      if (business) {
        this.selectedBusinessName.set(business.businessName);
      }
      this.fetchArchivedItems(this.selectedBusinessNumber());
    }

    this.selectedStatus.set(formValues.status ?? '');
    this.selectedDocumentType.set(formValues.documentType ?? '');
  }

  // ===========================
  // Fetch archived items from server
  // ===========================
  fetchArchivedItems(businessNumber: string): void {
    this.isLoadingDataTable.set(true);

    this.driveDocsService
      .getArchivedItems(businessNumber)
      .pipe(
        catchError(err => {
          console.error("Error fetching archived items:", err);
          return of([]);
        }),
        finalize(() => this.isLoadingDataTable.set(false))
      )
      .subscribe(items => this.rawItems.set(items));
  }

  private setFileActions(): void {
    this.fileActions.set([
      {
        name: 'preview',
        icon: 'pi pi-eye',
        title: 'הצג קובץ',
        alwaysShow: true,
        showWhen: (row: IRowDataTable) => !!(row as any).driveFileId,
        action: (event: any, row: IRowDataTable) => {
          this.onPreviewClicked(row);
        }
      },
    ]);
  }

  onPreviewClicked(doc: IRowDataTable): void {
    const driveFileId = (doc as any).driveFileId;
    if (!driveFileId) return;
    window.open(`https://drive.google.com/file/d/${driveFileId}/view`, '_blank');
  }
}
