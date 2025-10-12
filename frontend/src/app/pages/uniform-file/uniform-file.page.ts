import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { BusinessInfo, IColumnDataTable, IPnlReportData, ISelectItem, IUserData } from 'src/app/shared/interface';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';
import { catchError, EMPTY, finalize, firstValueFrom, map, tap, throwError } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { BusinessMode, FormTypes, ReportingPeriodType, UniformFileDocumentSummaryColumns, UniformFileDocumentSummaryHebrewColumns, UniformFileListSummaryColumns, UniformFileListSummaryHebrewColumns } from 'src/app/shared/enums';
import { GenericService } from 'src/app/services/generic.service';

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

  // Business-related properties
  BusinessMode = BusinessMode;
  businessMode: BusinessMode = BusinessMode.ONE_BUSINESS;
  showBusinessSelector = false;
  businessUiList: ISelectItem[] = [];
  businessFullList: BusinessInfo[] = [];


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

  constructor(private formBuilder: FormBuilder, public authService: AuthService, private fileService: FilesService, private genericService: GenericService) {
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
    const businessData = this.genericService.getBusinessData(this.userData);
    this.businessMode = businessData.mode;
    this.businessUiList = businessData.uiList;
    this.businessFullList = businessData.fullList;
    this.showBusinessSelector = businessData.showSelector;

    if (this.userData.isTwoBusinessOwner) {
      this.businessNames.push({ name: this.userData.businessName, value: this.userData.businessNumber });
      this.businessNames.push({ name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber });
      this.uniformFileForm.get('businessNumber')?.setValidators([Validators.required]);
    }
    else {
      this.uniformFileForm.get('businessNumber')?.patchValue(this.userData.id);
    }

  }


  async onSubmit() {

    const formData = this.uniformFileForm.value;
    this.reportClick = false;

    const selectedBusiness = this.businessFullList.find(b => b.value === formData.businessNumber);

    this.reportDetails = {
      businessNumber: selectedBusiness?.value ?? '',
      businessName: selectedBusiness?.name ?? '',
      startDate: formData.startDate,
      endDate: formData.endDate,
      downloadLink: '',        // placeholder
      // structureLink: 'https://yourdomain.com/download/structure.pdf'     // placeholder
    };

    // const businessNumber = this.authService.getUserBussinesNumber();

    const { document_summary, list_summary, filePath } =
    await this.createUniformFile(formData.startDate, formData.endDate, this.reportDetails.businessNumber);

    this.uniformFileDocumentSummary = document_summary;
    this.uniformFileListSummary = list_summary;
    this.reportDetails.downloadLink = filePath;

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