import { Component, OnInit, signal, inject } from '@angular/core';
import { of } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { DriveDocsService } from 'src/app/services/drive-docs.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IMobileCardConfig, IRowDataTable, ITableRowAction, IUserData } from 'src/app/shared/interface';
import { BusinessStatus, FormTypes } from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { FormBuilder, FormGroup } from '@angular/forms';

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
  myArchivedDocs: any;
  fileActions = signal<ITableRowAction[]>([]);

  // ===========================
  // Table config
  // ===========================
  mobileCardConfig: IMobileCardConfig = {
    primaryFields: ['supplier'],
    highlightedField: 'amount',
    dateField: 'date',
    hiddenFields: ['id', 'driveFileId'],
    highlightedValueFormat: 'plain'
  };

  archivedDocsTableFields: IColumnDataTable<string, string>[] = [
    { name: 'supplier', value: 'ספק', type: FormTypes.TEXT },
    { name: 'date', value: 'תאריך', type: FormTypes.DATE },
    { name: 'invoiceNumber', value: 'מספר חשבונית', type: FormTypes.TEXT },
    { name: 'amount', value: 'סכום', type: FormTypes.TEXT },
    { name: 'category', value: 'קטגוריה', type: FormTypes.TEXT },
    { name: 'subCategory', value: 'תת קטגוריה', type: FormTypes.TEXT },
  ];

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

      this.fetchArchivedDocs(this.selectedBusinessNumber());
    });

    this.filterConfig = [
      {
        type: 'select',
        controlName: 'businessNumber',
        label: 'בחר עסק',
        required: true,
        options: this.businessOptions,
        defaultValue: this.selectedBusinessNumber()
      },
    ];

    this.fetchArchivedDocs(this.selectedBusinessNumber());
  }

  // ===========================
  // Handle filter submit
  // ===========================
  onSubmit(formValues: any): void {
    this.selectedBusinessNumber.set(formValues.businessNumber);

    const business = this.gs.businesses().find(
      b => b.businessNumber === formValues.businessNumber
    );

    if (business) {
      this.selectedBusinessName.set(business.businessName);
    }

    this.fetchArchivedDocs(this.selectedBusinessNumber());
  }

  // ===========================
  // Fetch archived documents from server
  // ===========================
  fetchArchivedDocs(businessNumber: string): void {
    this.isLoadingDataTable.set(true);

    this.myArchivedDocs = this.driveDocsService
      .getArchivedDocuments(businessNumber)
      .pipe(
        map((docs) => docs.map((doc) => ({
          ...doc,
          supplier: doc.supplier || '-',
          date: doc.date || '-',
          invoiceNumber: doc.invoiceNumber || '-',
          amount: doc.amount != null ? `${doc.amount} ${doc.currency || '₪'}` : '-',
          category: doc.category || '-',
          subCategory: doc.subCategory || '-',
        }))),
        catchError(err => {
          console.error("Error fetching archived documents:", err);
          return of([]);
        }),
        finalize(() => this.isLoadingDataTable.set(false))
      );
  }

  private setFileActions(): void {
    this.fileActions.set([
      {
        name: 'preview',
        icon: 'pi pi-eye',
        title: 'הצג קובץ',
        alwaysShow: true,
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
