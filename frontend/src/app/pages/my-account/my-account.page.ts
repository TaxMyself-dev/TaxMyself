import { Component, inject, OnInit } from '@angular/core';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { AuthService } from 'src/app/services/auth.service';
import { FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IItemNavigate, IUserData } from 'src/app/shared/interface';
import { TransactionsService } from '../transactions/transactions.page.service';
import { catchError, EMPTY, map } from 'rxjs';
import { GenericService } from 'src/app/services/generic.service';

@Component({
    selector: 'app-my-account',
    templateUrl: './my-account.page.html',
    styleUrls: ['./my-account.page.scss'],
    standalone: false
})
export class MyAccountPage implements OnInit {

  transactionService = inject(TransactionsService);
  genericService = inject(GenericService);

  userData: IUserData;
  transToClassify: any;

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  

  itemsNavigate: IItemNavigate[] = [
    { name: "הפקת מסמך", link: "/doc-create", image: "../../../assets/icon-doc-create.svg", content: 'מפיקים מסמך בקלי קלות', id: '0', index: 'zero' },
    { name: "המסמכים שלי", link: "/my-storage", image: "../../../assets/icon-my-docs.svg", content: 'כל הקבצים במקום אחד', id:'1', index: 'one'}, 
    // { name: "הוספת הוצאה", link: "/add-expenses", image: "cloud-upload-outline", id: '1', index: 'one' }, 
    { name: "התזרים שלי", link: "/transactions", image: "../../../assets/icon-my-trans.svg", content: 'צפייה וסיווג תנועות בחשבון', id: '2', index: 'two' }, 
    { name: "דוחות", link: "/reports", image: "../../../assets/icon-report-create.svg", content: 'דוחות לרשויות בקליק', id: '3', index: 'three' },
  ];

    fieldsNamesExpenses: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
      { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
      { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.NUMBER },
      // { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
      // { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
      // { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
      { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.NUMBER },
      { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
      // { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized, type: FormTypes.TEXT },
      // { name: TransactionsOutcomesColumns.MONTH_REPORT, value: TransactionsOutcomesHebrewColumns.monthReport, type: FormTypes.TEXT },
      { name: TransactionsOutcomesColumns.NOTE, value: TransactionsOutcomesHebrewColumns.note, type: FormTypes.TEXT },
    ];

  constructor(private authService: AuthService) { }

  ngOnInit() {
    console.log("MyAccountPage initialized");
    
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.getTransToClassify(); 
  }


  getTransToClassify(): void {
    console.log("Fetching transactions to classify...");
    
  this.transToClassify = this.transactionService
    .getTransToClassify()
    .pipe(
      catchError(err => {
        console.error('Error in getTransToClassify:', err);
        return EMPTY;
      }),
      map(data =>
        data
          // .filter(row => row.isRecognized)
          .map(row => ({
            ...row,
            sum: this.genericService.addComma(Math.abs(row.sum as number)),
            businessNumber:
              row.businessNumber === this.userData.businessNumber
                ? this.userData.businessName
                : this.userData.spouseBusinessName
          }))
      )
    );
    console.log("transToClassify: ", this.transToClassify);
    
}

}
