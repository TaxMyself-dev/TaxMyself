import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { ArchiveDocumentClassification, DriveDocsService, ArchivedItem, RecordSource, ArchiveItemStatus } from 'src/app/services/drive-docs.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IMobileCardConfig, IRowDataTable, ITableRowAction, IUserData, ISelectItem } from 'src/app/shared/interface';
import { BusinessStatus, FormTypes, ICellRenderer } from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ActivatedRoute } from '@angular/router';

/** Hebrew labels for `ArchiveItemStatus` (see backend `src/enum.ts`). */
export const ARCHIVE_STATUS_LABELS: Record<ArchiveItemStatus, string> = {
  DELETED: 'נמחק',
  PENDING: 'ממתין לאישור',
  APPROVED: 'אושר',
  FILED_ANNUAL: 'שייך לדוח שנתי',
  ARCHIVED: 'לטיפול בהמשך',
  REJECTED: 'נדחה',
  ERROR: 'שגיאה בעיבוד',
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
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private route = inject(ActivatedRoute);

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
  selectedStatus = signal<string>('ACTIVE');
  selectedDocumentType = signal<string>('');
  fileActions = signal<ITableRowAction[]>([]);
  approvalDialogItem = signal<ArchivedItem | null>(null);
  classificationDialogItem = signal<ArchivedItem | null>(null);
  rejectionReasonEditorVisible = signal(false);
  rejectionReasonDraft = signal('');

  readonly archiveStatusLabels = ARCHIVE_STATUS_LABELS;
  readonly recordSourceLabels = RECORD_SOURCE_LABELS;

  // ===========================
  // Table config
  // ===========================
  mobileCardConfig: IMobileCardConfig = {
    primaryFields: ['name'],
    highlightedField: 'sourceLabel',
    dateField: 'uploadDate',
    hiddenFields: ['id', 'driveFileId', 'itemType', 'status', 'statusLabel', 'documentType'],
    highlightedValueFormat: 'plain'
  };

  readonly archivedDocsTableFields = computed<IColumnDataTable<string, string>[]>(() => [
    { name: 'name', value: 'שם המסמך / תנועה', type: FormTypes.TEXT },
    { name: 'documentTypeLabel', value: 'סוג מסמך', type: FormTypes.TEXT },
    { name: 'statusLabel', value: 'סטטוס', type: FormTypes.TEXT, cellRenderer: ICellRenderer.STATUS_BADGE },
    { name: 'uploadDate', value: 'תאריך העלאה', type: FormTypes.DATE },
    { name: 'sourceLabel', value: 'מקור העלאה', type: FormTypes.TEXT },
  ]);

  // Client-side filter over the fully-fetched per-business row set — mirrors
  // the small dataset size this page has always worked with (no pagination).
  readonly filteredItems = computed(() => {
    const status = this.selectedStatus();
    const docType = this.selectedDocumentType();
    return this.rawItems()
      // "All" means all ACTIVE archive items, never soft-deleted items.
      // Deleted documents are visible only through the dedicated option.
      .filter(item => {
        if (status === 'DELETED') return item.status === 'DELETED';
        if (item.status === 'DELETED') return false;
        return status === 'ACTIVE' || item.status === status;
      })
      .filter(item => !docType || (item.documentType ?? TRANSACTION_TYPE_VALUE) === docType)
      .map(item => ({
        ...item,
        documentTypeLabel: item.documentType
          ? (DOCUMENT_TYPE_LABELS[item.documentType] ?? item.documentType)
          : TRANSACTION_TYPE_LABEL,
        sourceLabel: this.recordSourceLabels[item.source] ?? item.source,
        statusLabel: this.archiveStatusLabels[item.status] ?? item.status,
        statusDetail: item.status === 'REJECTED'
          ? (item.rejectionReason?.trim() || 'לא הוזנה סיבת דחייה')
          : null,
        uploadDate: item.uploadDate ? item.uploadDate.slice(0, 10) : '-',
      }));
  });

  // ===========================
  // Filter config (used by FilterTab)
  // ===========================
  form: FormGroup = this.fb.group({});
  filterConfig: FilterField[] = [];

  private readonly statusOptions: ISelectItem[] = [
    { name: 'הכל', value: 'ACTIVE' },
    { name: ARCHIVE_STATUS_LABELS.APPROVED, value: 'APPROVED' },
    { name: ARCHIVE_STATUS_LABELS.FILED_ANNUAL, value: 'FILED_ANNUAL' },
    { name: ARCHIVE_STATUS_LABELS.ARCHIVED, value: 'ARCHIVED' },
    { name: ARCHIVE_STATUS_LABELS.REJECTED, value: 'REJECTED' },
    { name: ARCHIVE_STATUS_LABELS.PENDING, value: 'PENDING' },
    { name: ARCHIVE_STATUS_LABELS.ERROR, value: 'ERROR' },
    { name: 'מסמכים שנמחקו', value: 'DELETED' },
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

    // Businesses are identity-scoped. Always refresh them after navigation
    // so an accountant leaving a client view cannot use the client's cached
    // first business while the signed-in accountant's request is in flight.
    await this.gs.loadBusinessesFromServer();
    const businesses = this.gs.businesses();
    if (businesses.length === 0) {
      this.rawItems.set([]);
      return;
    }
    const requestedBusinessNumber = this.route.snapshot.queryParamMap.get('businessNumber');
    const initialBusiness = businesses.find(b => b.businessNumber === requestedBusinessNumber) ?? businesses[0];
    this.selectedBusinessNumber.set(initialBusiness.businessNumber);
    this.selectedBusinessName.set(initialBusiness.businessName);

    this.form = this.fb.group({
      businessNumber: [this.selectedBusinessNumber()],
      status: ['ACTIVE'],
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

    this.form.get('status')?.valueChanges.subscribe(value => this.selectedStatus.set(value ?? 'ACTIVE'));
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
        defaultValue: 'ACTIVE',
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

    this.selectedStatus.set(formValues.status ?? 'ACTIVE');
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
        name: 'approve-expense',
        icon: 'pi pi-check-circle',
        title: 'אשר כהוצאה',
        alwaysShow: true,
        showWhen: (row: IRowDataTable) =>
          (row as any).itemType === 'DOCUMENT'
          && !!(row as any).canResolve
          && (row as any).documentKind !== 'ANNUAL_DOCUMENT',
        action: (_event: any, row: IRowDataTable) => this.onApproveClicked(row),
      },
      {
        name: 'reclassify-document',
        icon: 'pi pi-tag',
        title: 'שנה סיווג',
        alwaysShow: true,
        showWhen: (row: IRowDataTable) =>
          (row as any).itemType === 'DOCUMENT' && !!(row as any).canReclassify,
        action: (_event: any, row: IRowDataTable) =>
          this.openClassificationDialog(row as unknown as ArchivedItem),
      },
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
      {
        name: 'delete',
        icon: 'pi pi-trash',
        title: 'מחק מסמך',
        alwaysShow: true,
        showWhen: (row: IRowDataTable) =>
          (row as any).itemType === 'DOCUMENT'
          && (row as any).status !== 'DELETED'
          && (row as any).status !== 'APPROVED'
          && !!(row as any).driveFileId,
        action: (event: any, row: IRowDataTable) => {
          this.onDeleteClicked(row);
        }
      },
      {
        name: 'restore',
        icon: 'pi pi-refresh',
        title: 'שחזר מסמך',
        alwaysShow: true,
        showWhen: (row: IRowDataTable) =>
          (row as any).itemType === 'DOCUMENT'
          && (row as any).status === 'DELETED',
        action: (event: any, row: IRowDataTable) => {
          this.onRestoreClicked(row);
        }
      },
    ]);
  }

  onApproveClicked(doc: IRowDataTable): void {
    const documentId = Number(doc.id ?? 0);
    if (!documentId || !(doc as any).canResolve) return;
    this.approvalDialogItem.set(doc as unknown as ArchivedItem);
  }

  closeApprovalDialog(): void {
    this.approvalDialogItem.set(null);
  }

  onExpenseApproved(): void {
    this.approvalDialogItem.set(null);
    this.fetchArchivedItems(this.selectedBusinessNumber());
  }

  openClassificationDialog(item: ArchivedItem): void {
    this.classificationDialogItem.set(item);
    this.rejectionReasonEditorVisible.set(false);
    this.rejectionReasonDraft.set(item.rejectionReason?.trim() ?? '');
  }

  closeClassificationDialog(): void {
    this.classificationDialogItem.set(null);
    this.rejectionReasonEditorVisible.set(false);
    this.rejectionReasonDraft.set('');
  }

  isCurrentClassification(classification: ArchiveDocumentClassification): boolean {
    return this.classificationDialogItem()?.status === classification;
  }

  beginRejectDocument(): void {
    this.rejectionReasonEditorVisible.set(true);
  }

  cancelRejectDocument(): void {
    this.rejectionReasonEditorVisible.set(false);
  }

  saveRejectedDocument(): void {
    this.reclassifyDocument('REJECTED', this.rejectionReasonDraft().trim() || null);
  }

  reclassifyDocument(
    classification: ArchiveDocumentClassification,
    rejectionReason?: string | null,
  ): void {
    const item = this.classificationDialogItem();
    if (!item?.canReclassify) return;
    if (classification !== 'REJECTED' && this.isCurrentClassification(classification)) return;
    this.classificationDialogItem.set(null);
    this.rejectionReasonEditorVisible.set(false);
    this.isLoadingDataTable.set(true);
    this.driveDocsService.reclassifyArchivedDocument(item.id, classification, rejectionReason)
      .pipe(
        catchError(err => {
          console.error('Document reclassification failed', err);
          this.messageService.add({
            severity: 'error', summary: 'שגיאה',
            detail: err?.error?.message ?? 'שינוי סיווג המסמך נכשל', life: 4000, key: 'br',
          });
          return of(null);
        }),
        finalize(() => this.isLoadingDataTable.set(false)),
      )
      .subscribe(result => {
        if (!result) return;
        this.fetchArchivedItems(this.selectedBusinessNumber());
        this.messageService.add({
          severity: 'success', summary: 'סיווג המסמך עודכן',
          detail: 'המסמך נשאר בארכיון תחת הסיווג החדש', life: 3000, key: 'br',
        });
      });
  }

  onPreviewClicked(doc: IRowDataTable): void {
    const driveFileId = (doc as any).driveFileId;
    if (!driveFileId) return;
    window.open(`https://drive.google.com/file/d/${driveFileId}/view`, '_blank');
  }

  onDeleteClicked(doc: IRowDataTable): void {
    const documentId = Number(doc.id ?? 0);
    if (!documentId || (doc as any).itemType !== 'DOCUMENT' || (doc as any).status === 'APPROVED') return;

    this.confirmationService.confirm({
      header: 'מחיקת מסמך',
      message: 'האם אתה בטוח שאתה מעוניין למחוק את המסמך? הקובץ יישמר וניתן יהיה למצוא אותו בסינון לפי סטטוס נמחק.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'מחק',
      rejectLabel: 'ביטול',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteArchivedDocument(documentId),
    });
  }

  private deleteArchivedDocument(documentId: number): void {
    this.isLoadingDataTable.set(true);
    this.driveDocsService.deleteArchivedDocument(documentId)
      .pipe(
        catchError(err => {
          console.error('Error deleting archived document:', err);
          this.isLoadingDataTable.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'מחיקת המסמך נכשלה',
            life: 3000,
            key: 'br',
          });
          return of(null);
        }),
      )
      .subscribe(result => {
        if (!result) return;
        // Refetch so the soft-deleted row disappears from the default view
        // and remains available through the DELETED status filter.
        this.fetchArchivedItems(this.selectedBusinessNumber());
        this.messageService.add({
          severity: 'success',
          summary: 'המסמך נמחק מהארכיון',
          detail: 'הקובץ נשמר וניתן לצפות בו דרך סינון מסמכים שנמחקו',
          life: 3000,
          key: 'br',
        });
      });
  }

  onRestoreClicked(doc: IRowDataTable): void {
    const documentId = Number(doc.id ?? 0);
    if (!documentId || (doc as any).itemType !== 'DOCUMENT') return;

    this.isLoadingDataTable.set(true);
    this.driveDocsService.restoreArchivedDocument(documentId)
      .pipe(
        catchError(err => {
          console.error('Error restoring archived document:', err);
          this.isLoadingDataTable.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'שחזור המסמך נכשל',
            life: 3000,
            key: 'br',
          });
          return of(null);
        }),
      )
      .subscribe(result => {
        if (!result) return;
        this.fetchArchivedItems(this.selectedBusinessNumber());
        this.messageService.add({
          severity: 'success',
          summary: 'המסמך שוחזר',
          detail: 'המסמך חזר לסטטוס שהיה לו לפני המחיקה',
          life: 3000,
          key: 'br',
        });
      });
  }
}
