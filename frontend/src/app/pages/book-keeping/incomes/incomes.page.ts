import { Component, OnInit, signal, inject } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { DocumentsService } from 'src/app/services/documents.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable } from 'src/app/shared/interface';
import { DocumentsTableColumns, DocumentsTableHebrewColumns, FormTypes } from 'src/app/shared/enums';

@Component({
  selector: 'app-incomes',
  templateUrl: './incomes.page.html',
  styleUrls: ['./incomes.page.scss', '../../../shared/shared-styling.scss'],
  standalone: false
})
export class IncomesPage implements OnInit {
  documentsService = inject(DocumentsService);
  genericService = inject(GenericService);

  isLoadingDataTable = signal<boolean>(false);
  myDocuments: any;

  documentsTableFields: IColumnDataTable<DocumentsTableColumns, DocumentsTableHebrewColumns>[] = [
    { name: DocumentsTableColumns.DOC_DATE, value: DocumentsTableHebrewColumns.docDate, type: FormTypes.DATE },
    { name: DocumentsTableColumns.DOC_TYPE, value: DocumentsTableHebrewColumns.docType, type: FormTypes.TEXT },
    { name: DocumentsTableColumns.DOC_NUMBER, value: DocumentsTableHebrewColumns.docNumber, type: FormTypes.TEXT },
    { name: DocumentsTableColumns.CLIENT_NAME, value: DocumentsTableHebrewColumns.clientName, type: FormTypes.TEXT },
    { name: DocumentsTableColumns.DOC_SUM, value: DocumentsTableHebrewColumns.docSum, type: FormTypes.NUMBER },
  ];

  // mock business number – later replace with real user data
  businessNumber = '204245724';

  ngOnInit(): void {
    // Load default docs (Jan 1 → today)
    this.fetchDocuments();
  }

  fetchDocuments(startDate?: string, endDate?: string, docType?: string): void {

    console.log("fetchDocuments - start");
    
    this.isLoadingDataTable.set(true);

    this.myDocuments = this.documentsService
      .getDocuments(this.businessNumber, startDate, endDate, docType)
      .pipe(
        catchError(err => {
          console.error('Error fetching documents:', err);
          return EMPTY;
        }),
        finalize(() => this.isLoadingDataTable.set(false)),
        map((data: any[]) =>
          data.map(row => ({
            ...row,
            sum: this.genericService.addComma(Math.abs(row.sum as number)),
          }))
        )
      );
  }

  // Called from UI when user clicks “Apply Filter”
  onFilterApply(startDate: string, endDate: string, docType?: string) {
    this.fetchDocuments(startDate, endDate, docType);
  }
}





// import {} from '@angular/common/http';
// import { Component, OnInit, signal, inject } from '@angular/core';
// import { EMPTY } from 'rxjs';
// import { catchError, finalize, map } from 'rxjs/operators';
// import { IColumnDataTable } from 'src/app/shared/interface';
// import { DocumentsTableColumns, DocumentsTableHebrewColumns, FormTypes } from 'src/app/shared/enums';
// import { DocumentsService } from 'src/app/services/documents.service';
// import { GenericService } from 'src/app/services/generic.service';

// @Component({
//     selector: 'app-incomes',
//     templateUrl: './incomes.page.html',
//     styleUrls: ['./incomes.page.scss', '../../../shared/shared-styling.scss'],
//     standalone: false
// })
// export class IncomesPage implements OnInit {

//   documentsService = inject(DocumentsService);
//   genericService = inject(GenericService);

//   isLoadingDataTable = signal<boolean>(false);

//   myDocuments: any;

//   documentsTableFields: IColumnDataTable<DocumentsTableColumns, DocumentsTableHebrewColumns>[] = [
//     { name: DocumentsTableColumns.DOC_DATE, value: DocumentsTableHebrewColumns.docDate, type: FormTypes.DATE },
//     { name: DocumentsTableColumns.DOC_TYPE, value: DocumentsTableHebrewColumns.docType, type: FormTypes.TEXT },
//     { name: DocumentsTableColumns.DOC_NUMBER, value: DocumentsTableHebrewColumns.docNumber, type: FormTypes.TEXT },
//     { name: DocumentsTableColumns.CLIENT_NAME, value: DocumentsTableHebrewColumns.clientName, type: FormTypes.TEXT },
//     { name: DocumentsTableColumns.DOC_SUM, value: DocumentsTableHebrewColumns.docSum, type: FormTypes.NUMBER },
//   ];

//   constructor(){
//   }

//   ngOnInit() {
//   }

  
//   getDocuments(): void {
//     this.isLoadingDataTable.set(true);
//     this.myDocuments = this.documentsService.getDocuments()
//       .pipe(
//         catchError(err => {
//           console.error('Error in getDocuments:', err);
//           return EMPTY;
//         }),
//         finalize(() => this.isLoadingDataTable.set(false)),
//         map((data: any[]) =>
//           data
//             .map(row => ({
//               ...row,
//               sum: this.genericService.addComma(Math.abs(row.sum as number)),
//             }))
//         )
//       );
//   }


// }
