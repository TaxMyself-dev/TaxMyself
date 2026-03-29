import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { DialogService } from 'primeng/dynamicdialog';
import { catchError, EMPTY, finalize, map, Observable, of, Subject, take, takeUntil, takeWhile } from 'rxjs';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { DashboardNavigateComponent } from 'src/app/components/dashboard-navigate/dashboard-navigate.component';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { MannualExpenseComponent } from 'src/app/components/mannual-expense/mannual-expense.component';
import { AuthService } from 'src/app/services/auth.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { GenericService } from 'src/app/services/generic.service';
import { FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IMobileCardConfig, IItemNavigate, IRowDataTable, ITableRowAction, ITransactionData, IUserData } from 'src/app/shared/interface';
import { SharedModule } from 'src/app/shared/shared.module';
import { TransactionsService } from '../transactions/transactions.page.service';
import { FeezbackService } from 'src/app/services/feezback.service';
import { SyncStatusService } from 'src/app/services/sync-status.service';
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
  ],
  providers: [DialogService]
})
export class MyAccountPage implements OnInit {

  transactionService = inject(TransactionsService);
  genericService = inject(GenericService);
  expenseService = inject(ExpenseDataService);
  feezbackService = inject(FeezbackService);
  messageService = inject(MessageService);
  private readonly syncStatusService = inject(SyncStatusService);
  private readonly destroyRef = inject(DestroyRef);

  dialogService = inject(DialogService);
  // dialogRef = inject(DynamicDialogRef);
  // dialogConfig = inject(DynamicDialogConfig);
  isLoadingDataTable = signal<boolean>(false);
  /** Passed to generic-table via [processStatus]. null = normal rendering. */
  readonly syncProcessStatus = signal<'running' | 'failed' | null>(null);
  /** Emitting on this Subject cancels the current polling session so a new one can start cleanly. */
  private readonly restartPolling$ = new Subject<void>();
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

  // ─── Mobile card configuration ───────────────────────────────────────────
  mobileCardConfig: IMobileCardConfig = {
    primaryFields:    [TransactionsOutcomesColumns.NAME],
    highlightedField:  TransactionsOutcomesColumns.SUM,
    dateField:         TransactionsOutcomesColumns.BILL_DATE,
    hiddenFields:      [],
  };

  // ─── Row actions — same showWhen conditions as transactions page.
  //     Callbacks are stubs until classify/associate dialogs are wired into this page.
  rowActions: ITableRowAction[] = [
    {
      name: 'associate',
      icon: 'pi pi-link',
      title: 'שייך לחשבון',
      showWhen: (row) => row['billName'] === 'לא שוייך',
      action: (_event?: any, _row?: IRowDataTable) => { /* TODO: wire account-association dialog */ },
    },
    {
      name: 'classify',
      icon: 'pi pi-tag',
      title: 'סיווג תנועה',
      showWhen: (row) => row['billName'] !== 'לא שוייך',
      action: (_event?: any, _row?: IRowDataTable) => { /* TODO: wire classify dialog */ },
    },
    {
      name: 'quickClassify',
      icon: 'pi pi-bolt',
      title: 'סיווג מהיר',
      showWhen: (row) => row['billName'] !== 'לא שוייך',
      action: (_event?: any, _row?: IRowDataTable) => { /* TODO: wire quick classify */ },
    },
  ];

  constructor(private authService: AuthService) { }

  ngOnInit() {
    console.log("MyAccountPage initialized");

    this.userData = this.authService.getUserDataFromLocalStorage();
    this.startSyncStatusPolling();
  }

  /**
   * Sole gatekeeper for when data may be fetched.
   *
   * Reacts immediately to the first emitted status — no seenRunning guard needed
   * because the backend never returns 'empty' to the frontend.
   *
   * running   → show loading state, keep polling
   * completed → fetch data once, clear loading state, stop polling
   * failed    → show error state, clear current data, stop polling
   * error     → treat as failed, stop polling
   *
   * hasFetched prevents a duplicate fetch if 'completed' is somehow emitted twice.
   * takeWhile(..., inclusive=true) ensures the terminal emission is processed before
   * the stream completes.
   */
  private startSyncStatusPolling(): void {
    // Cancels any previous polling session before starting a new one.
    this.restartPolling$.next();

    let hasFetched = false;

    this.syncStatusService.getSyncStageStream()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        takeUntil(this.restartPolling$),
        takeWhile(
          stageState => stageState?.processStatus === 'running',
          /* inclusive */ true,
        ),
        catchError(err => {
          console.warn('[MyAccount] Sync status stream error — treating as failed', err);
          this.syncProcessStatus.set('failed');
          this.transToClassify = of([]);
          return EMPTY;
        }),
      )
      .subscribe(stageState => {
        if (!stageState) {
          this.syncProcessStatus.set('failed');
          this.transToClassify = of([]);
          return;
        }

        const status = stageState.processStatus;

        if (status === 'running') {
          this.syncProcessStatus.set('running');
        } else if (status === 'completed') {
          this.syncProcessStatus.set(null);
          if (!hasFetched) {
            hasFetched = true;
            this.getTransToClassify();
          }
        } else if (status === 'failed') {
          this.syncProcessStatus.set('failed');
          this.transToClassify = of([]);
        }
      });
  }

  /**
   * Called when the generic-table retry button is clicked.
   * Explicitly triggers a backend sync, shows the loading state immediately,
   * then restarts the polling/fetch orchestration.
   *
   * Both 'started' and 'running' (was 'already_running') responses are treated
   * identically — a sync is in progress, so we poll for it.
   */
  onSyncTriggered(): void {
    this.syncProcessStatus.set('running');
    this.syncStatusService.triggerSync()
      .pipe(take(1))
      .subscribe({
        next: () => this.startSyncStatusPolling(),
        error: (err) => {
          console.error('[MyAccount] triggerSync failed during retry:', err);
          this.syncProcessStatus.set('failed');
          this.transToClassify = of([]);
        },
      });
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
