import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { BusinessInfo, IColumnDataTable, IMobileCardConfig, IPnlReportData, ISelectItem, IUserData } from 'src/app/shared/interface';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';
import { catchError, EMPTY, finalize, firstValueFrom, map, tap, throwError } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { FormTypes, ReportingPeriodType, UniformFileDocumentSummaryColumns, UniformFileDocumentSummaryHebrewColumns, UniformFileListSummaryColumns, UniformFileListSummaryHebrewColumns } from 'src/app/shared/enums';
import { GenericService } from 'src/app/services/generic.service';
import { BusinessStatus } from 'src/app/shared/enums';
import { FilterField, FilterFieldType } from 'src/app/components/filter-tab/filter-fields-model.component';
import { MessageService } from 'primeng/api';
import {
  ShaamService,
  UniformFileSubmissionView,
} from 'src/app/services/shaam.service';

export interface ReportDetails {
  businessNumber: string;
  businessName: string;
  startDate: string;
  endDate: string;
  downloadLink: string;
  // structureLink: string;
}

@Component({
    selector: 'app-uniform-file',
    templateUrl: './uniform-file.page.html',
    styleUrls: ['./uniform-file.page.scss', '../../shared/shared-styling.scss'],
    standalone: false
})
export class UniformFilePage implements OnInit {

  private gs = inject(GenericService);

  appName = 'Keepintax';
  registrationNumber = '2580001';
  generatedAt!: Date;

  uniformFileForm: FormGroup;
  pnlReport: IPnlReportData;
  userData: IUserData;
  displayExpenses: boolean = false;
  isLoading: boolean = false;
  reportClick: boolean = true;
  startDate: string;
  endDate: string;
  totalExpense: number = 0;
  businessNames: ISelectItem[] = [];

  reportingPeriodType = ReportingPeriodType;
  reportDetails: ReportDetails | null = null;
  shaamSubmission: UniformFileSubmissionView | null = null;
  shaamConnected = false;
  shaamBusy = false;

  // Business related
  businessNumber = signal<string>("");
  BusinessStatus = BusinessStatus;
  businessStatus: BusinessStatus = BusinessStatus.SINGLE_BUSINESS;
  businessOptions = this.gs.businessSelectItems;

  // Filter config (used by FilterTab)
  form: FormGroup = this.formBuilder.group({});
  filterConfig: FilterField[] = [];

  uniformFileDocumentSummary: any;

  uniformFileDocumentSummaryTitles: IColumnDataTable<UniformFileDocumentSummaryColumns, UniformFileDocumentSummaryHebrewColumns>[] = [
    { name: UniformFileDocumentSummaryColumns.DOC_NUMBER, value: UniformFileDocumentSummaryHebrewColumns.docNumber, type: FormTypes.TEXT },
    { name: UniformFileDocumentSummaryColumns.DOC_DESCRIPTION, value: UniformFileDocumentSummaryHebrewColumns.docDescription, type: FormTypes.TEXT },
    { name: UniformFileDocumentSummaryColumns.TOTAL_DOCS, value: UniformFileDocumentSummaryHebrewColumns.totalDocs, type: FormTypes.TEXT },
    { name: UniformFileDocumentSummaryColumns.TOTAL_SUM, value: UniformFileDocumentSummaryHebrewColumns.totalSum, type: FormTypes.TEXT },
  ];

  uniformFileListSummary: any;

  uniformFileListSummaryTitles: IColumnDataTable<UniformFileListSummaryColumns, UniformFileListSummaryHebrewColumns>[] = [
    { name: UniformFileListSummaryColumns.LIST_NUMBER, value: UniformFileListSummaryHebrewColumns.listNumber, type: FormTypes.TEXT },
    { name: UniformFileListSummaryColumns.LIST_DESCRIPION, value: UniformFileListSummaryHebrewColumns.listDescription, type: FormTypes.TEXT },
    { name: UniformFileListSummaryColumns.LIST_TOTAL, value: UniformFileListSummaryHebrewColumns.listTotal, type: FormTypes.TEXT },
  ];

  documentSummaryMobileConfig: IMobileCardConfig = {
    primaryFields: [UniformFileDocumentSummaryColumns.DOC_DESCRIPTION],
    highlightedField: UniformFileDocumentSummaryColumns.TOTAL_SUM,
    dateField: '',
    hiddenFields: [],
  };

  listSummaryMobileConfig: IMobileCardConfig = {
    primaryFields: [UniformFileListSummaryColumns.LIST_DESCRIPION],
    highlightedField: '',
    dateField: '',
    hiddenFields: [],
  };

  constructor(
    private formBuilder: FormBuilder,
    public authService: AuthService,
    private fileService: FilesService,
    private genericService: GenericService,
    private dateService: DateService,
    private messageService: MessageService,
    private shaamService: ShaamService,
  ) {
    this.uniformFileForm = this.formBuilder.group({
      startDate: new FormControl(
        Date,
      ),
      endDate: new FormControl(
        Date,
      ),
      businessNumber: new FormControl(
        '',
      ),
    })
  }


  ngOnInit() {

    this.userData = this.authService.getUserDataFromLocalStorage();
    this.businessStatus = this.userData.businessStatus;
    const businesses = this.gs.businesses();
    this.businessNumber.set(businesses[0].businessNumber);

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

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
        allowedPeriodModes: [ReportingPeriodType.DATE_RANGE],
        periodDefaults: {
          periodMode: ReportingPeriodType.DATE_RANGE,
          year: currentYear,
        }
      },
    ];

  }


  async onSubmit(formValues?: any) {

    this.generatedAt = new Date();

    // Use formValues from filter-tab if provided, otherwise use uniformFileForm
    let formData: any;
    let startDate: string;
    let endDate: string;
    let businessNumber: string;

    try {
    if (formValues) {
      // Handle period values from filter-tab
      const { startDate: periodStartDate, endDate: periodEndDate } = this.dateService.getStartAndEndDates(
        formValues.periodMode,
        formValues.year,
        formValues.month,
        formValues.startDate,
        formValues.endDate
      );
      startDate = this.dateService.toIsoDate(periodStartDate);
      endDate = this.dateService.toIsoDate(periodEndDate);
      // Get businessNumber from formValues (selected by user) or fallback to signal
      businessNumber = formValues.businessNumber || this.businessNumber();
      // Update the signal with the selected business number
      if (formValues.businessNumber) {
        this.businessNumber.set(formValues.businessNumber);
      }
    } else {
      // Use uniformFileForm values
      formData = this.uniformFileForm.value;
      startDate = this.dateService.toIsoDate(formData.startDate);
      endDate = this.dateService.toIsoDate(formData.endDate);
      businessNumber = formData.businessNumber || this.businessNumber();
      // Update the signal with the selected business number
      if (formData.businessNumber) {
        this.businessNumber.set(formData.businessNumber);
      }
    }

    this.reportClick = false;
    this.shaamSubmission = null;
    this.shaamConnected = false;

    // Find business name from businesses list
    const businesses = this.gs.businesses();
    const selectedBusiness = businesses.find(b => b.businessNumber === businessNumber);
    const businessName = selectedBusiness?.businessName || '';

    // Initialize reportDetails before using it
    this.reportDetails = {
      businessNumber: businessNumber,
      businessName: businessName,
      startDate: startDate,
      endDate: endDate,
      downloadLink: '',
    };

    const { document_summary, list_summary, filePath } =
    await this.createUniformFile(startDate, endDate, businessNumber);

    this.uniformFileDocumentSummary = document_summary;
    this.uniformFileListSummary = list_summary;
    this.reportDetails.downloadLink = filePath;

    } catch (err: any) {
      const message = err?.message ?? 'אירעה שגיאה בהפקת הדוח';
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: message,
        life: 5000,
        key: 'br'
      });
    }
  }


  createUniformFile(startDate: string, endDate: string, businessNumber: string): Promise<{ document_summary: any[]; list_summary: any[]; filePath: string; file: string }> {
    return firstValueFrom(
      this.fileService.createUniformFile(startDate, endDate, businessNumber).pipe(
        tap((response) => this.downloadBase64Zip(response.file)),
        map((response) => {
          const document_summary = (response.document_summary ?? []).map(row => ({
            ...row,
            totalDocs: this.genericService.addComma(Math.abs(row.totalDocs as number)),
            totalSum:  this.genericService.addComma(Math.abs(row.totalSum as number)),
          }));
          return {
            document_summary,
            list_summary: response.list_summary,
            filePath: response.filePath,
            file: response.file,
          };
        })
      )
    );
  }

  async prepareShaamSubmission(): Promise<void> {
    if (!this.reportDetails || this.shaamBusy) return;
    await this.runShaamAction(async () => {
      this.shaamSubmission = await firstValueFrom(
        this.shaamService.prepareUniformFileSubmission(
          this.reportDetails!.businessNumber,
          this.reportDetails!.startDate,
          this.reportDetails!.endDate,
        ),
      );
      await this.refreshShaamConnection(false);
      this.showSuccess('הקובץ הוכן לשליחה לשע״מ');
    });
  }

  async refreshShaamConnection(showToast = true): Promise<void> {
    if (!this.reportDetails) return;
    const status = await firstValueFrom(
      this.shaamService.getConnectionStatus(
        this.reportDetails.businessNumber,
        'UNIFORM_FILE',
      ),
    );
    this.shaamConnected = status.connected;
    if (showToast) {
      this.showSuccess(status.connected ? 'החיבור לשע״מ פעיל' : 'נדרש חיבור לשע״מ');
    }
  }

  async checkShaamConnection(): Promise<void> {
    if (this.shaamBusy) return;
    await this.runShaamAction(() => this.refreshShaamConnection());
  }

  async connectShaam(): Promise<void> {
    if (!this.reportDetails || this.shaamBusy) return;
    await this.runShaamAction(async () => {
      const { url } = await firstValueFrom(
        this.shaamService.getAuthorizeUrl(
          this.reportDetails!.businessNumber,
          'UNIFORM_FILE',
        ),
      );
      window.location.assign(url);
    });
  }

  async transferShaamSubmission(): Promise<void> {
    if (!this.reportDetails || !this.shaamSubmission || this.shaamBusy) return;
    await this.runShaamAction(async () => {
      this.shaamSubmission = await firstValueFrom(
        this.shaamService.transferUniformFileSubmission(
          this.reportDetails!.businessNumber,
          this.shaamSubmission!.id,
        ),
      );
      this.showSuccess(this.shaamSubmission.state === 'APPROVED'
        ? 'הקבצים אושרו בשע״מ'
        : 'הקבצים נשלחו וממתינים לעיבוד');
    });
  }

  async pollShaamSubmission(): Promise<void> {
    if (!this.reportDetails || !this.shaamSubmission || this.shaamBusy) return;
    await this.runShaamAction(async () => {
      this.shaamSubmission = await firstValueFrom(
        this.shaamService.pollUniformFileSubmission(
          this.reportDetails!.businessNumber,
          this.shaamSubmission!.id,
        ),
      );
      this.showSuccess('סטטוס שע״מ עודכן');
    });
  }

  shaamStateLabel(state: string): string {
    const labels: Record<string, string> = {
      GENERATED: 'מוכן לשליחה',
      AUTH_REQUIRED: 'נדרש חיבור לשע״מ',
      LINKS_RESERVED: 'קישורי העלאה הוזמנו',
      INI_UPLOADED: 'קובץ INI הועלה',
      PAIR_UPLOADED: 'שני הקבצים הועלו',
      PROCESSING: 'ממתין לעיבוד בשע״מ',
      APPROVED: 'אושר בשע״מ',
      REJECTED: 'נדחה בשע״מ',
      RETRYABLE_FAILURE: 'השליחה נכשלה',
      UNKNOWN_OUTCOME: 'תוצאת השליחה אינה ידועה',
    };
    return labels[state] ?? state;
  }

  canPollShaam(): boolean {
    return !!this.shaamSubmission && [
      'LINKS_RESERVED', 'INI_UPLOADED', 'PAIR_UPLOADED', 'PROCESSING',
      'UNKNOWN_OUTCOME',
    ].includes(this.shaamSubmission.state);
  }

  private async runShaamAction(action: () => Promise<void>): Promise<void> {
    this.shaamBusy = true;
    try {
      await action();
    } catch (error: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה בתהליך שע״מ',
        detail: error?.error?.message || error?.message || 'לא ניתן להשלים את הפעולה',
        life: 6000,
        key: 'br',
      });
    } finally {
      this.shaamBusy = false;
    }
  }

  private showSuccess(detail: string): void {
    this.messageService.add({
      severity: 'success',
      summary: 'הפעולה הושלמה',
      detail,
      life: 4000,
      key: 'br',
    });
  }

private downloadBase64Zip(base64: string) {
  const zipBuffer = this.base64ToArrayBuffer(base64);
  const blob = new Blob([zipBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `openformat.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}


}
