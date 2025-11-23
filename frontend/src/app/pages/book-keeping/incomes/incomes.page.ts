import { Component, OnInit, signal, inject } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { DocumentsService } from 'src/app/services/documents.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IUserData } from 'src/app/shared/interface';
import {
  BusinessStatus,
  DocumentsTableColumns,
  DocumentsTableHebrewColumns,
  FormTypes
} from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { DateService } from 'src/app/services/date.service';
import { DocumentType } from '../../doc-create/doc-cerate.enum';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { FormBuilder, FormGroup } from '@angular/forms';

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
  private fb = inject(FormBuilder);

  // ===========================
  // Global state
  // ===========================
  userData!: IUserData;
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

  // ===========================
  // Table config
  // ===========================
  documentsTableFields: IColumnDataTable<DocumentsTableColumns, DocumentsTableHebrewColumns>[] = [
    { name: DocumentsTableColumns.DOC_DATE, value: DocumentsTableHebrewColumns.docDate, type: FormTypes.DATE },
    { name: DocumentsTableColumns.DOC_TYPE, value: DocumentsTableHebrewColumns.docType, type: FormTypes.TEXT },
    { name: DocumentsTableColumns.DOC_NUMBER, value: DocumentsTableHebrewColumns.docNumber, type: FormTypes.TEXT },
    { name: DocumentsTableColumns.CLIENT_NAME, value: DocumentsTableHebrewColumns.clientName, type: FormTypes.TEXT },
    { name: DocumentsTableColumns.DOC_SUM, value: DocumentsTableHebrewColumns.docSum, type: FormTypes.NUMBER },
  ];

  // ===========================
  // Filter config (used by FilterTab)
  // ===========================
  filterConfig: FilterField[] = [];

  // ===========================
  // Init
  // ===========================
  async ngOnInit() {

    this.userData = this.authService.getUserDataFromLocalStorage();
    this.businessStatus = this.userData.businessStatus;

    // Load businesses BEFORE config
    await this.gs.loadBusinesses();

    // Now config can be set safely
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

    // Load initial data: default business for user
    this.fetchDocuments(this.userData.businessNumber);
  }

  // ===========================
  // Handle filter submit
  // ===========================
  onSubmit(formValues: any): void {

    console.log("Submitted filter:", formValues);

    const businessNumber = formValues.businessNumber;
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

    this.fetchDocuments(businessNumber, startDate, endDate, docType);
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
        catchError(err => {
          console.error('Error fetching documents:', err);
          return EMPTY;
        }),
        finalize(() => this.isLoadingDataTable.set(false)),
        map((rows: any[]) =>
          rows.map(row => ({
            ...row,
            sum: this.gs.addComma(Math.abs(row.sum as number)),
          }))
        )
      );
  }
}
