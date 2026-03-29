import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { DialogService } from 'primeng/dynamicdialog';
import { catchError, EMPTY, finalize, map, Observable } from 'rxjs';
import { AccountAssociationDialogComponent } from 'src/app/components/account-association-dialog/account-association-dialog.component';
import { AddBillComponent } from 'src/app/components/add-bill/add-bill.component';
import { AddCategoryComponent } from 'src/app/components/add-category/add-category.component';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { ClassifyTranComponent } from 'src/app/components/classify-tran/classify-tran.component';
import { DashboardNavigateComponent } from 'src/app/components/dashboard-navigate/dashboard-navigate.component';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { MannualExpenseComponent } from 'src/app/components/mannual-expense/mannual-expense.component';
import { AuthService } from 'src/app/services/auth.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { GenericService } from 'src/app/services/generic.service';
import { BusinessStatus, TransactionsOutcomesColumns } from 'src/app/shared/enums';
import { IMobileCardConfig, IItemNavigate, IRowDataTable, ISelectItem, ITableRowAction, ITransactionData, IUserData } from 'src/app/shared/interface';
import { SharedModule } from 'src/app/shared/shared.module';
import { buildTransactionColumns } from 'src/app/shared/transaction-columns.config';
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
    GenericTableComponent,
    AccountAssociationDialogComponent,
    AddBillComponent,
    ClassifyTranComponent,
    AddCategoryComponent,
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
  // mobileMenuOpen = signal<boolean>(false);
  isLoadingFeezback = signal<boolean>(false);
  isLoadingUserAccounts = signal<boolean>(false);
  isLoadingUserBankTransactions = signal<boolean>(false);
  isLoadingUserCardTransactions = signal<boolean>(false);
  isLoadingAllTransactions = signal<boolean>(false);
  isProd = signal<boolean>(process.env.NODE_ENV == 'production');

  userData: IUserData;
  transToClassify: Observable<ITransactionData[]>;

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  isMobile = computed(() => this.genericService.isMobile());



  private readonly allItemsNavigate: IItemNavigate[] = [
    { name: "הפקת מסמך", link: "/doc-create", image: "../../../assets/icon-doc-create.svg", content: 'מפיקים מסמך בקלי קלות', id: '0', index: 'zero' },
    { name: "הנהלת חשבונות", link: "/book-keeping", image: "../../../assets/icon-my-docs.svg", content: 'ניהול הכנסות והוצאות העסק', id: '1', index: 'one' },
    { name: "התזרים שלי", link: "/transactions", image: "../../../assets/icon-my-trans.svg", content: 'צפייה וסיווג תנועות בחשבון', id: '2', index: 'two' },
    { name: "דוחות", link: "/reports", image: "../../../assets/icon-report-create.svg", content: 'דוחות לרשויות בקליק', id: '3', index: 'three' },
  ];

  /** במצב צפייה כרואה חשבון – לא מציגים הפקת מסמך (צפייה בלבד) */
  get itemsNavigate(): IItemNavigate[] {
    if (this.authService.isViewingAsClient()) {
      return this.allItemsNavigate.filter((item) => item.link !== '/doc-create');
    }
    return this.allItemsNavigate;
  }

  // ─── User-context signals (set in ngOnInit from userData) ────────────────
  isOnlyEmployer = signal<boolean>(false);
  businessStatus = signal<BusinessStatus>(BusinessStatus.NO_BUSINESS);

  // ─── Column definitions: derived from shared config ───────────────────────
  fieldsNamesExpenses = computed(() =>
    buildTransactionColumns({ businessStatus: this.businessStatus(), isOnlyEmployer: this.isOnlyEmployer() })
  );

  // ─── Mobile card configuration ───────────────────────────────────────────
  mobileCardConfig: IMobileCardConfig = {
    primaryFields:    [TransactionsOutcomesColumns.NAME],
    highlightedField:  TransactionsOutcomesColumns.SUM,
    dateField:         TransactionsOutcomesColumns.BILL_DATE,
    hiddenFields:      [],
  };

  // ─── Dialog visibility signals ────────────────────────────────────────────
  visibleAccountAssociationDialog = signal<boolean>(false);
  visibleClassifyTran             = signal<boolean>(false);
  visibleAddBill                  = signal<boolean>(false);
  visibleAddCategory              = signal<boolean>(false);

  // ─── Shared panel data ────────────────────────────────────────────────────
  leftPanelData     = signal<IRowDataTable>(null);
  incomeMode        = signal<boolean>(false);
  subCategoryMode   = signal<boolean>(false);
  categoryName      = signal<string>('');
  accountsList      = signal<ISelectItem[]>([]);
  isLoadingQuickClassify = signal<boolean>(false);

  // ─── Row actions ─────────────────────────────────────────────────────────
  rowActions: ITableRowAction[] = [
    {
      name: 'associate',
      icon: 'pi pi-link',
      title: 'שייך לחשבון',
      showWhen: (row) => row['billName'] === 'לא שוייך',
      action: (_, row) => row && this.onAssociateAccount(row),
    },
    {
      name: 'classify',
      icon: 'pi pi-tag',
      title: 'סיווג תנועה',
      showWhen: (row) => row['billName'] !== 'לא שוייך',
      action: (_, row) => row && this.onClassifyTransaction(row),
    },
    {
      name: 'quickClassify',
      icon: 'pi pi-bolt',
      title: 'סיווג מהיר',
      showWhen: (row) => row['billName'] !== 'לא שוייך',
      isLoading: () => this.isLoadingQuickClassify(),
      action: (_, row) => row && this.onQuickClassify(row),
    },
  ];

  constructor(private authService: AuthService) { }

  ngOnInit() {
    console.log("MyAccountPage initialized");

    this.userData = this.authService.getUserDataFromLocalStorage();

    if (this.userData?.employmentStatus === 'employee' && this.userData?.spouseEmploymentStatus === 'employee') {
      this.isOnlyEmployer.set(true);
    }
    if (this.userData?.businessStatus === BusinessStatus.MULTI_BUSINESS) {
      this.businessStatus.set(BusinessStatus.MULTI_BUSINESS);
    } else if (this.userData?.businessStatus === BusinessStatus.SINGLE_BUSINESS) {
      this.businessStatus.set(BusinessStatus.SINGLE_BUSINESS);
    }

    this.transactionService.getAllBills();
    this.accountsList = this.transactionService.accountsList;

    this.getTransToClassify();
  }

  // ─── Row-action handlers ──────────────────────────────────────────────────

  onAssociateAccount(row: IRowDataTable): void {
    this.visibleAccountAssociationDialog.set(true);
    this.leftPanelData.set(row);
  }

  onClassifyTransaction(row: IRowDataTable): void {
    this.authService.setActiveBusinessNumberByName(row.businessNumber as string);
    this.visibleClassifyTran.set(true);
    this.leftPanelData.set(row);
    this.incomeMode.set(false);
  }

  onQuickClassify(row: IRowDataTable): void {
    this.isLoadingQuickClassify.set(true);
    this.transactionService.quickClassify(row.finsiteId as string)
      .pipe(
        catchError(() => {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'סיווג ההוצאה נכשל אנא נסה/י שנית', life: 3000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.isLoadingQuickClassify.set(false))
      )
      .subscribe(() => {
        this.getTransToClassify();
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'סיווג מהיר הצליח', life: 3000, key: 'br' });
      });
  }

  // ─── Dialog close handlers ────────────────────────────────────────────────

  closeAccountAssociation(event: { visible: boolean; data: boolean }): void {
    this.visibleAccountAssociationDialog.set(event.visible);
    if (event.data) { this.getTransToClassify(); }
  }

  openAddBill(event: any): void {
    this.visibleAddBill.set(event);
  }

  closeAddBill(event: { visible: boolean; data?: boolean }): void {
    this.visibleAddBill.set(event.visible);
  }

  closeClassifyTran(event: { visible: boolean; data: boolean }): void {
    this.visibleClassifyTran.set(event.visible);
    if (event.data) { this.getTransToClassify(); }
  }

  openAddCategory(event: { state: boolean; subCategoryMode: boolean; data: IRowDataTable; category?: string }): void {
    this.visibleAddCategory.set(event.state);
    this.subCategoryMode.set(event.subCategoryMode);
    this.leftPanelData.set(event.data);
    this.categoryName.set(event.category ?? '');
  }

  closeAddCategory(event: { visible: boolean; data?: boolean }): void {
    this.visibleAddCategory.set(event.visible);
    if (event.data) {
      this.transactionService.getCategories(null, true).subscribe();
    }
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
            })) as ITransactionData[]
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

  fetchUserBankTransactions(): void {
    this.isLoadingUserBankTransactions.set(true);

    this.feezbackService.getUserBankTransactions('booked')
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
        finalize(() => this.isLoadingUserBankTransactions.set(false))
      )
      .subscribe(response => {
        console.log('User transactions data:', response);
        this.showSyncToast(response?.syncSummary);
      });
  }

  fetchUserCardTransactions(): void {
    this.isLoadingUserCardTransactions.set(true);

    this.feezbackService.getUserCardTransactions('booked')
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
        finalize(() => this.isLoadingUserCardTransactions.set(false))
      )
      .subscribe(response => {
        console.log('User transactions data:', response);
        this.showSyncToast(response?.syncSummary);
      });
  }

  fetchAllUserTransactions(): void {
    this.isLoadingAllTransactions.set(true);

    this.feezbackService.getAllUserTransactions('booked')
      .pipe(
        catchError(err => {
          console.error('Error fetching all user transactions:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'לא הצלחנו לטעון את התנועות. אנא נסה שוב מאוחר יותר.',
            life: 5000,
            key: 'br'
          });
          return EMPTY;
        }),
        finalize(() => this.isLoadingAllTransactions.set(false))
      )
      .subscribe(response => {
        console.log('All user transactions (bank + card):', response);
        this.showSyncToast(response?.syncSummary);
      });
  }

  private showSyncToast(syncSummary: any): void {
    if (!syncSummary) {
      this.messageService.add({
        severity: 'warn',
        summary: 'התראה',
        detail: 'לא נמצאו תנועות או שהפורמט לא צפוי',
        life: 5000,
        key: 'br'
      });
      return;
    }

    const bank = syncSummary.bank;
    const card = syncSummary.card;
    const system = syncSummary.system;

    const hasBank = bank?.transactionsFetched > 0;
    const hasCard = card?.transactionsFetched > 0;

    if (!hasBank && !hasCard) {
      this.messageService.add({
        severity: 'warn',
        summary: 'התראה',
        detail: 'לא נמצאו תנועות בנק או אשראי.',
        life: 5000,
        key: 'br'
      });
      return;
    }

    const lines: string[] = ['הייבוא הושלם בהצלחה.'];

    if (hasBank) {
      lines.push(`נטענו ${bank.transactionsFetched} תנועות בנק מ־${bank.banksProcessed} חשבונות.`);
    }
    if (hasCard) {
      lines.push(`נטענו ${card.transactionsFetched} תנועות כרטיסי אשראי מ־${card.cardsProcessed} כרטיסים.`);
    }

    lines.push(`בסך הכול עובדו ${system.totalProcessed} תנועות: ${system.savedInCurrentImport} נשמרו בייבוא הנוכחי, ו־${system.alreadyExisting} כבר היו קיימות במערכת.`);

    this.messageService.add({
      severity: 'success',
      summary: 'הצלחה',
      detail: lines.join('\n'),
      life: 8000,
      key: 'br'
    });
  }

  // openModalAddExpenses(): void {
  //   this.expenseService.openModalAddExpense().subscribe()
  // }
  // openMobileMenu(): void {
  //   this.mobileMenuOpen.set(true);
  // }

  // closeMobileMenu(): void {
  //   this.mobileMenuOpen.set(false);
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
