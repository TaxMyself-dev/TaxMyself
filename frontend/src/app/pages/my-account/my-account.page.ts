import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { DialogService } from 'primeng/dynamicdialog';
import { catchError, EMPTY, finalize, map } from 'rxjs';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { DashboardNavigateComponent } from 'src/app/components/dashboard-navigate/dashboard-navigate.component';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { MannualExpenseComponent } from 'src/app/components/mannual-expense/mannual-expense.component';
import { AuthService } from 'src/app/services/auth.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { GenericService } from 'src/app/services/generic.service';
import { FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IItemNavigate, IUserData } from 'src/app/shared/interface';
import { SharedModule } from 'src/app/shared/shared.module';
import { TransactionsService } from '../transactions/transactions.page.service';
import { FeezbackService } from 'src/app/services/feezback.service';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-my-account',
  templateUrl: './my-account.page.html',
  styleUrls: ['./my-account.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    DashboardNavigateComponent,
    AvatarModule,
    AvatarGroupModule,
    ButtonComponent,
    GenericTableComponent
  ],
  providers: [DialogService]
})
export class MyAccountPage implements OnInit {

  transactionService = inject(TransactionsService);
  genericService = inject(GenericService);
  expenseService = inject(ExpenseDataService);
  feezbackService = inject(FeezbackService);
  messageService = inject(MessageService);

  dialogService = inject(DialogService);
  // dialogRef = inject(DynamicDialogRef);
  // dialogConfig = inject(DynamicDialogConfig);
  isLoadingDataTable = signal<boolean>(false);
  isLoadingFeezback = signal<boolean>(false);
  isLoadingUserAccounts = signal<boolean>(false);
  isLoadingTransactions = signal<boolean>(false);

  userData: IUserData;
  transToClassify: any;

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;


  itemsNavigate: IItemNavigate[] = [
    { name: "הפקת מסמך", link: "/doc-create", image: "../../../assets/icon-doc-create.svg", content: 'מפיקים מסמך בקלי קלות', id: '0', index: 'zero' },
    { name: "הנהלת חשבונות", link: "/book-keeping", image: "../../../assets/icon-my-docs.svg", content: 'ניהול הכנסות והוצאות העסק', id: '1', index: 'one' },
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
    this.isLoadingDataTable.set(true);
    this.transToClassify = this.transactionService
      .getTransToClassify()
      .pipe(
        catchError(err => {
          console.error('Error in getTransToClassify:', err);
          return EMPTY;
        }),
        finalize(() => this.isLoadingDataTable.set(false)),
        map(data =>
          data
            // .filter(row => row.isRecognized)
            .map(row => ({
              ...row,
              sum: this.genericService.addComma(Math.abs(row.sum as number)),
              businessNumber:
                row?.businessNumber === this.userData?.businessNumber
                  ? this.userData?.businessName
                  : this.userData?.spouseBusinessName
            }))
        )
      );
  }

  openAddExpensesPage(): void {

  }

  connectToOpenBanking(): void {
    this.isLoadingFeezback.set(true);

    this.feezbackService.createConsentLink()
      .pipe(
        catchError(err => {
          console.error('Error creating Feezback consent link:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'לא הצלחנו ליצור קישור לחיבור. אנא נסה שוב מאוחר יותר.',
            life: 5000,
            key: 'br'
          });
          return EMPTY;
        }),
        finalize(() => this.isLoadingFeezback.set(false))
      )
      .subscribe(response => {
        // The response should contain a link property
        const link = response?.link || response?.url || response;

        if (link && typeof link === 'string') {
          // Open the link in a new window/tab
          window.open(link, '_blank');
        } else {
          console.error('Unexpected response format:', response);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'תגובה לא צפויה מהשרת. אנא נסה שוב.',
            life: 5000,
            key: 'br'
          });
        }
      });
  }

  fetchUserAccounts(): void {
    this.isLoadingUserAccounts.set(true);

    this.feezbackService.getUserAccounts()
      .pipe(
        catchError(err => {
          console.error('Error fetching user accounts:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'לא הצלחנו לטעון את נתוני החשבונות. אנא נסה שוב מאוחר יותר.',
            life: 5000,
            key: 'br'
          });
          return EMPTY;
        }),
        finalize(() => this.isLoadingUserAccounts.set(false))
      )
      .subscribe(response => {
        console.log('User accounts data:', response);

        if (response?.accounts && Array.isArray(response.accounts)) {
          this.messageService.add({
            severity: 'success',
            summary: 'הצלחה',
            detail: `נטענו ${response.accounts.length} חשבונות בהצלחה`,
            life: 3000,
            key: 'br'
          });

          // כאן תוכל לעשות משהו עם הנתונים - למשל לשמור ב-DB או להציג בטבלה
          // TODO: Process and store the accounts data
        } else {
          this.messageService.add({
            severity: 'warn',
            summary: 'התראה',
            detail: 'לא נמצאו חשבונות או שהפורמט לא צפוי',
            life: 5000,
            key: 'br'
          });
        }
      });
  }

  fetchUserTransactions(): void {
    this.isLoadingTransactions.set(true);

    this.feezbackService.getUserTransactions('booked')
      .pipe(
        catchError(err => {
          console.error('Error fetching user transactions:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'לא הצלחנו לטעון את התנועות. אנא נסה שוב מאוחר יותר.',
            life: 5000,
            key: 'br'
          });
          return EMPTY;
        }),
        finalize(() => this.isLoadingTransactions.set(false))
      )
      .subscribe(response => {
        console.log('User transactions data:', response);

        if (response?.transactions && Array.isArray(response.transactions)) {
          // Show message with saved count from database
          const savedCount = response?.databaseSaveResult?.saved || 0;
          const skippedCount = response?.databaseSaveResult?.skipped || 0;
          const totalFetched = response?.totalTransactions || response.transactions.length || 0;
          const accountsProcessed = response?.accountsProcessed || 0;

          let detailMessage = '';
          if (savedCount > 0) {
            detailMessage = `נשמרו ${savedCount} תנועות חדשות מ-${accountsProcessed} חשבונות בהצלחה`;
            if (skippedCount > 0) {
              detailMessage += ` (${skippedCount} תנועות כבר קיימות, ${totalFetched} סה"כ נטענו)`;
            } else {
              detailMessage += ` (${totalFetched} סה"כ נטענו)`;
            }
          } else if (skippedCount > 0) {
            detailMessage = `כל התנועות כבר קיימות במערכת (${skippedCount} תנועות, ${totalFetched} סה"כ נטענו מ-${accountsProcessed} חשבונות)`;
          } else {
            detailMessage = `נטענו ${totalFetched} תנועות מ-${accountsProcessed} חשבונות`;
          }

          this.messageService.add({
            severity: 'success',
            summary: 'הצלחה',
            detail: detailMessage,
            life: 6000,
            key: 'br'
          });

          // כאן תוכל לעשות משהו עם הנתונים - למשל לשמור ב-DB או להציג בטבלה
          // TODO: Process and store the transactions data
        } else {
          this.messageService.add({
            severity: 'warn',
            summary: 'התראה',
            detail: 'לא נמצאו תנועות או שהפורמט לא צפוי',
            life: 5000,
            key: 'br'
          });
        }
      });
  }

  // openModalAddExpenses(): void {
  //   this.expenseService.openModalAddExpense().subscribe()
  // }
  openMannualExpenses(): void {
    // this.dialogRef = 
    this.dialogService.open(MannualExpenseComponent, {
      header: 'הוספת הוצאה ידנית',
      width: '480px',
      style: { maxWidth: '95vw' }, // 👈 מומלץ למובייל
      rtl: true,
      closable: true,
      dismissableMask: true,
      modal: true,
      // data: {
      //   businessNumber: this.selectedBusinessNumber,
      //   clients: this.clients()
      // }
    });
  }
}
