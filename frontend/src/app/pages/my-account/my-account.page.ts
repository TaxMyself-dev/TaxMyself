import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { DialogService } from 'primeng/dynamicdialog';
import { catchError, EMPTY, finalize, map, Observable, of, Subject, take, takeUntil, takeWhile } from 'rxjs';
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
import { SourceResult, SyncStatusService } from 'src/app/services/sync-status.service';
import { MessageService } from 'primeng/api';
import { BillingStateService } from 'src/app/services/billing-state.service';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { AccessService, FeatureState } from 'src/app/services/access.service';
import { AccessHandlerService } from 'src/app/services/access-handler.service';
import { AppFeature } from 'src/app/shared/access-control';

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
    ProgressSpinnerModule,
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
  private readonly billingStateService = inject(BillingStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly accessService = inject(AccessService);
  private readonly accessHandlerService = inject(AccessHandlerService);

  readonly access = {
    createDocumentRecommended: computed(() => this.accessService.getFeatureState(AppFeature.DOC_CREATE_BUTTON_RECOMMENDED_PIVOT)),
    transactionsRecommended:   computed(() => this.accessService.getFeatureState(AppFeature.TRANSACTIONS_BUTTON_RECOMMENDED_PIVOT)),
    addExpense:                computed(() => this.accessService.getFeatureState(AppFeature.ADD_EXPENSE_BUTTON)),
    openBankingConnect:        computed(() => this.accessService.getFeatureState(AppFeature.OPEN_BANKING_CONNECT)),
    addOpenBankingButton:      computed(() => this.accessService.getFeatureState(AppFeature.ADD_OPEN_BANKING_BUTTON)),
    openBankingTable:          computed(() => this.accessService.getFeatureState(AppFeature.OPEN_BANKING_TABLE)),
  };

  onDocCreateCardClick(): void {
    const result = this.accessHandlerService.handleFeatureAccess(AppFeature.DOC_CREATE_BUTTON_RECOMMENDED_PIVOT);
    if (result.allowed) {
      this.router.navigate(['/doc-create']);
    }
  }

  onTransactionsCardClick(): void {
    const result = this.accessHandlerService.handleFeatureAccess(AppFeature.TRANSACTIONS_BUTTON_RECOMMENDED_PIVOT);
    if (result.allowed) {
      this.router.navigate(['/transactions']);
    }
  }

  dialogService = inject(DialogService);
  // dialogRef = inject(DynamicDialogRef);
  // dialogConfig = inject(DynamicDialogConfig);
  isLoadingDataTable = signal<boolean>(false);
  /** Passed to generic-table via [processStatus]. null = normal rendering. */
  readonly syncProcessStatus = signal<'running' | 'failed' | null>(null);
  readonly syncSourceResults = signal<SourceResult[]>([]);
  readonly syncRanThisSession = signal(false);
  readonly isRetryingSource = signal<string | null>(null);
  /** Emitting on this Subject cancels the current polling session so a new one can start cleanly. */
  private readonly restartPolling$ = new Subject<void>();
  // mobileMenuOpen = signal<boolean>(false);
  isLoadingFeezback = signal<boolean>(false);
  isLoadingUserAccounts = signal<boolean>(false);
  /** Spinner state for the dashboard's "אפס נתוני בדיקה" button (demo users only). */
  isResettingDemo = signal<boolean>(false);

  private readonly adminPanelService = inject(AdminPanelService);

  userData: IUserData;
  transToClassify: Observable<ITransactionData[]>;

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  isMobile = computed(() => this.genericService.isMobile());

  // Feezback onboarding dialog (shown only when arriving from Feezback URL)
  // 'awaiting-webhook' = consent OK, waiting for the UserDataIsAvailable webhook
  //   (discovery) before the pull button can be enabled.
  // 'prompt'           = discovery done; waiting for the user to click "pull".
  feezbackDialogVisible = signal<boolean>(false);
  feezbackDialogStatus = signal<'awaiting-webhook' | 'prompt' | 'loading' | 'success' | 'failure' | null>(null);
  /** Cancels the post-consent webhook-readiness poll when it resolves / dialog closes. */
  private readonly stopWebhookPoll$ = new Subject<void>();
  feezbackDialogTitle = signal<string>('');
  /** Remembers the dev `?simulate=true` flag across the prompt → pull click (query params are cleared on return). */
  private pendingPostConsentSimulate = false;
  /** Dev sim scenario (?scenario=) — drives Stage B/C simulate-webhook / simulate-pull calls. */
  private pendingPostConsentScenario = 'success';
  /** Decorative status indicator next to the dialog title. null = no icon. */
  feezbackDialogIcon = signal<'success' | 'warning' | 'error' | null>(null);

  /**
   * Classifies the failure: 'consent' when ANY source is missing a consent
   * (drives the "לא התקבל אישור" warning title + "בצע חיבור מחדש" buttons);
   * 'sync' when every failure has a valid consentId (sync-side error → "נסה שוב");
   * null when no source is in a failed/not-synced state.
   */
  dialogErrorType = computed<'consent' | 'sync' | null>(() => {
    const rows = this.syncSourceResults();
    if (rows.length === 0) return null;
    const hasConsentIssue = rows.some(r =>
      r.status === 'not_synced' || (r.status === 'failed' && !r.consentId),
    );
    if (hasConsentIssue) return 'consent';
    const hasSyncFail = rows.some(r => r.status === 'failed' && !!r.consentId);
    return hasSyncFail ? 'sync' : null;
  });

  /**
   * True when EVERY source is failed-with-consent (no successes, no consent gaps).
   * Drives the single big "נסה שוב" button for the all-failed-sync case.
   * For partial sync failures (some success, some failed), we show per-source retry instead.
   */
  dialogAllSyncFailed = computed<boolean>(() => {
    const rows = this.syncSourceResults();
    if (rows.length === 0) return false;
    return rows.every(r => r.status === 'failed' && !!r.consentId);
  });

  // Consent dialog — shown before redirecting to Feezback portal
  consentDialogVisible = signal<boolean>(false);
  consentChecked = signal<boolean>(false);

  // ─── CardCom payment result banner ───────────────────────────────────────
  // Shown after the user returns from the CardCom hosted payment page.
  // Query params only mark "the user returned" — billing/me is the source of truth.
  readonly cardcomReturnDetected = signal(false);
  readonly paymentBannerDismissed = signal(false);
  readonly paymentPolling = signal(false);
  readonly resendingReceiptEmail = signal(false);
  readonly retryingInvoice = signal(false);
  private readonly cardcomRedirectFailure = signal<{ responseCode: string | null; status: string | null } | null>(null);
  private paymentReturnDetectedAt = 0;
  private paymentPollAttempts = 0;
  /**
   * Bounded poll spans the same window as PAYMENT_STATUS_TIMEOUT_MS (90s) so we
   * keep checking for a late-arriving webhook right up until the timeout fires.
   */
  private readonly PAYMENT_POLL_MAX_ATTEMPTS = 30;
  private readonly PAYMENT_POLL_INTERVAL_MS = 3000;
  /** Accept a billingPaymentResult as "for this return" if created up to this long before detection (clock skew / webhook racing the redirect). */
  private readonly PAYMENT_FRESHNESS_WINDOW_MS = 2 * 60_000;
  /**
   * Hard timeout: if we still don't know the outcome (webhook never arrived,
   * network issue, ngrok down, provider issue, etc.) after this long, stop
   * waiting and show PAYMENT_STATUS_UNKNOWN instead of spinning forever.
   */
  private readonly PAYMENT_STATUS_TIMEOUT_MS = 90_000;
  private paymentTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  /** Set once PAYMENT_STATUS_TIMEOUT_MS has elapsed since the CardCom redirect with no resolved outcome. */
  readonly paymentTimedOut = signal(false);

  private static readonly PAYMENT_STATUS_UNKNOWN_MESSAGE =
    'לא הצלחנו להשלים באופן אוטומטי את תהליך הפעלת המנוי.\n' +
    'ייתכן שהתשלום שלך כבר עובד בהצלחה.\n' +
    'אנא אל תבצע/י תשלום נוסף.\n' +
    'צור/י קשר עם התמיכה ואנחנו נבדוק את העסקה ונשלים את ההפעלה במידת הצורך.';

  readonly paymentResultBanner = computed<
    | { kind: 'success'; message: string }
    | { kind: 'email-failed'; message: string; eventId: number }
    | { kind: 'invoice-failed'; message: string; eventId: number }
    | { kind: 'failed'; message: string; detail?: string }
    | { kind: 'unknown'; message: string }
    | { kind: 'processing'; message: string }
    | null
  >(() => {
    if (!this.cardcomReturnDetected() || this.paymentBannerDismissed()) return null;

    const redirectFailure = this.cardcomRedirectFailure();
    if (redirectFailure) {
      return {
        kind: 'failed',
        message: 'התשלום נכשל',
        detail: redirectFailure.responseCode ? `קוד שגיאה: ${redirectFailure.responseCode}` : undefined,
      };
    }

    const result = this.billingStateService.billingPaymentResult();
    const isFresh =
      !!result &&
      new Date(result.createdAt).getTime() >= this.paymentReturnDetectedAt - this.PAYMENT_FRESHNESS_WINDOW_MS;

    const processingState = {
      kind: 'processing' as const,
      message: 'התשלום בוצע בהצלחה.\nאנחנו משלימים את הפעלת המנוי ומפיקים את החשבונית שלך...',
    };

    if (isFresh && result) {
      if (result.paymentStatus === 'FAILED') {
        return { kind: 'failed', message: 'התשלום נכשל', detail: result.failureReason ?? undefined };
      }
      // Charge was verified by CardCom but our own activation logic failed —
      // never call this "payment failed", the user may already be charged.
      if (result.paymentStatus === 'ACTIVATION_FAILED') {
        return { kind: 'unknown', message: MyAccountPage.PAYMENT_STATUS_UNKNOWN_MESSAGE };
      }
      if (result.receiptDocId != null) {
        if (result.receiptEmailSent === false) {
          return {
            kind: 'email-failed',
            message: 'התשלום בוצע בהצלחה והחשבונית נוצרה, אבל השליחה למייל נכשלה.',
            eventId: result.latestPaymentEventId!,
          };
        }
        return {
          kind: 'success',
          message: `התשלום בוצע בהצלחה.${result.receiptEmail ? ` חשבונית מס קבלה נשלחה למייל: ${result.receiptEmail}` : ' חשבונית מס קבלה נשלחה למייל שלך.'}`,
        };
      }
      // Payment succeeded but the receipt document hasn't been created yet.
      // Distinguish "still generating" from "generation permanently failed" —
      // payment success is already confirmed here, so this is never "failed payment".
      if (result.receiptFailed || this.paymentTimedOut()) {
        return {
          kind: 'invoice-failed',
          message: 'התשלום בוצע בהצלחה.\nהייתה תקלה בהפקה או בשליחה של החשבונית.',
          eventId: result.latestPaymentEventId!,
        };
      }
      return processingState;
    }

    // No resolved outcome yet — webhook may still be in flight, or may never arrive.
    if (this.paymentTimedOut()) {
      return { kind: 'unknown', message: MyAccountPage.PAYMENT_STATUS_UNKNOWN_MESSAGE };
    }

    return processingState;
  });



  private readonly allItemsNavigate: IItemNavigate[] = [
    { name: "הפקת מסמך", link: "/doc-create", image: "../../../assets/icon-doc-create.svg", content: 'מפיקים מסמך בקלי קלות', id: '0', index: 'zero' },
    { name: "הנהלת חשבונות", link: "/book-keeping", image: "../../../assets/icon-my-docs.svg", content: 'ניהול הכנסות והוצאות העסק', id: '1', index: 'one' },
    { name: "התזרים שלי", link: "/transactions", image: "../../../assets/icon-my-trans.svg", content: 'צפייה וסיווג תנועות בחשבון', id: '2', index: 'two' },
    { name: "דוחות", link: "/reports", image: "../../../assets/icon-report-create.svg", content: 'דוחות לרשויות בקליק', id: '3', index: 'three' },
  ];

  /**
   * Reactive list of recommended-action cards.
   * Filters items based on access state so HIDE-configured features are never rendered.
   * Also hides /doc-create when an accountant is viewing as a client.
   */
  readonly itemsNavigate = computed<IItemNavigate[]>(() => {
    const showTransactions = this.access.transactionsRecommended().visible;
    let items = this.allItemsNavigate.filter(item => {
      if (item.link === '/transactions') return showTransactions;
      return true;
    });
    // Hide /doc-create when an ACCOUNTANT is viewing as a client.
    if (this.authService.isViewingAsClient()) {
      const realUser = this.authService.getRealUserDataFromLocalStorage();
      const realUserIsAdmin = !!realUser?.role?.includes('ADMIN');
      if (!realUserIsAdmin && !this.authService.isViewingDemoUser()) {
        items = items.filter((item) => item.link !== '/doc-create');
      }
    }
    return items;
  });

  // ─── User-context signals (set in ngOnInit from userData) ────────────────
  isOnlyEmployer = signal<boolean>(false);
  businessStatus = signal<BusinessStatus>(BusinessStatus.NO_BUSINESS);
  hasOpenBanking = signal<boolean>(false);
  readonly BusinessStatus = BusinessStatus;

  // ─── Column definitions: derived from shared config ───────────────────────
  fieldsNamesExpenses = computed(() =>
    buildTransactionColumns({
      businessStatus: this.businessStatus(),
      isOnlyEmployer: this.isOnlyEmployer(),
      myAccountUnclassified: true,
    })
  );

  // ─── Mobile card configuration ───────────────────────────────────────────
  mobileCardConfig: IMobileCardConfig = {
    primaryFields:    [TransactionsOutcomesColumns.NAME],
    highlightedField:  TransactionsOutcomesColumns.SUM,
    dateField:         TransactionsOutcomesColumns.BILL_DATE,
    hiddenFields:      [],
    highlightedValueFormat: 'plain',   // sum is pre-formatted with the currency symbol (₪/$/€/£)
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

  private static isBillUnassigned(row: IRowDataTable): boolean {
    const b = row?.['billName'];
    return !b || String(b).trim() === '' || b === 'לא שוייך';
  }

  // ─── Row actions ─────────────────────────────────────────────────────────
  rowActions: ITableRowAction[] = [
    {
      name: 'associate',
      icon: 'pi pi-link',
      title: 'שייך לחשבון',
      showWhen: (row) => MyAccountPage.isBillUnassigned(row),
      action: (_, row) => row && this.onAssociateAccount(row),
    },
    {
      name: 'classify',
      icon: 'pi pi-tag',
      title: 'סיווג תנועה',
      showWhen: (row) => !MyAccountPage.isBillUnassigned(row),
      action: (_, row) => row && this.onClassifyTransaction(row),
    },
    {
      name: 'quickClassify',
      icon: 'pi pi-bolt',
      title: 'סיווג מהיר',
      showWhen: (row) => !MyAccountPage.isBillUnassigned(row),
      isLoading: () => this.isLoadingQuickClassify(),
      action: (_, row) => row && this.onQuickClassify(row),
    },
  ];

  constructor(
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
  ) { }

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

    this.hasOpenBanking.set(!!this.userData?.hasOpenBanking);

    this.transactionService.getAllBills();
    this.accountsList = this.transactionService.accountsList;

    if (this.hasOpenBanking()) {
      if (this.consumeDemoBankLoaderFlag()) {
        // Demo entrance: hold the "נתונים נמשכים מהבנק" loader for 5s
        // before letting the real sync polling resolve (which would
        // instantly flip to 'completed' for seeded demo data).
        this.syncProcessStatus.set('running');
        setTimeout(() => this.startSyncStatusPolling(), 5000);
      } else {
        this.startSyncStatusPolling();
      }
    }

    this.initFeezbackDialogFromReturnUrl();
    this.initPaymentResultFromReturnUrl();

    this.destroyRef.onDestroy(() => {
      if (this.paymentTimeoutHandle) clearTimeout(this.paymentTimeoutHandle);
    });
  }

  /** Reads and clears the one-shot flag set by the admin demo-data panel when
   *  it routed into this page on behalf of a demo user. */
  private consumeDemoBankLoaderFlag(): boolean {
    if (typeof sessionStorage === 'undefined') return false;
    const flag = sessionStorage.getItem('tm.demoSimulateBankLoader');
    if (!flag) return false;
    sessionStorage.removeItem('tm.demoSimulateBankLoader');
    return true;
  }

  /** Feezback consent redirect lands on `/my-account?feezbackStatus=...` (see backend JWT redirects). */
  private initFeezbackDialogFromReturnUrl(): void {
    const status = this.route.snapshot.queryParamMap.get('feezbackStatus');
    const simulate = this.route.snapshot.queryParamMap.get('simulate') === 'true';
    const scenario = this.route.snapshot.queryParamMap.get('scenario') ?? 'success';
    if (status !== 'success' && status !== 'failure') return;
    this.pendingPostConsentScenario = scenario;

    void this.router.navigate(['/my-account'], {
      replaceUrl: true,
      queryParams: {},
      queryParamsHandling: '',
    });

    if (status === 'success') {
      // Consent succeeded, but the user can only pull AFTER the
      // UserDataIsAvailable webhook has run discovery (Source rows with
      // consentId + resourceId). Show the dialog immediately in
      // 'awaiting-webhook' (loader) and poll until discovery completes,
      // then flip to 'prompt'.
      this.feezbackDialogStatus.set('awaiting-webhook');
      this.feezbackDialogTitle.set('שמחים שהצטרפת לבנקאות הפתוחה');
      this.feezbackDialogIcon.set(null);
      this.feezbackDialogVisible.set(true);
      this.pendingPostConsentSimulate = simulate;

      // Optimistically mark user as connected so the UI updates immediately
      this.hasOpenBanking.set(true);
      const stored = this.authService.getUserDataFromLocalStorage();
      if (stored) {
        stored.hasOpenBanking = true;
        localStorage.setItem('userData', JSON.stringify(stored));
      }

      if (simulate) {
        // Dev: drive the SAME temporal flow as production. The real
        // post-consent-sync poll runs (prints "[PostConsent] … waiting for
        // data-available webhook"); after 15s we fire dev/simulate-webhook
        // (prints the real DATA-AVAILABLE/SOURCE-DISCOVERY block + flips the
        // backend to 'completed') so the same poll then advances to 'prompt'.
        console.log('[MyAccount][DevSim] awaiting-webhook — real poll running; simulating data-available webhook in 15s');
        this.pollForWebhookReady();
        setTimeout(() => {
          if (this.feezbackDialogStatus() !== 'awaiting-webhook') return;
          this.syncStatusService.simulateWebhook(this.pendingPostConsentScenario)
            .pipe(take(1), takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => console.log('[MyAccount][DevSim] simulated data-available webhook fired'),
              error: (e) => console.error('[MyAccount][DevSim] simulateWebhook failed', e),
            });
        }, 15_000);
      } else {
        this.pollForWebhookReady();
      }
    } else if (status === 'failure') {
      this.feezbackDialogStatus.set('failure');
      this.feezbackDialogTitle.set('משהו בדרך השתבש והחיבור לבנקאות פתוחה לא הצליח...');
      this.feezbackDialogIcon.set('error');
      this.feezbackDialogVisible.set(true);
    }
  }

  /**
   * CardCom redirects back to /my-account with hosted-page params after checkout.
   * These params only mark "the user returned from CardCom" — billing/me (the
   * webhook's result) is the source of truth for payment/invoice/email status.
   */
  private initPaymentResultFromReturnUrl(): void {
    const params = this.route.snapshot.queryParamMap;
    const responseCode = params.get('ResponseCode') ?? params.get('responsecode');
    const status = params.get('Status') ?? params.get('status');
    const lowProfileCode = params.get('lowprofilecode') ?? params.get('LowProfileCode');
    const internalDealNumber = params.get('internalDealNumber') ?? params.get('internaldealnumber');

    const cardcomReturned = !!(responseCode || status || lowProfileCode || internalDealNumber);
    if (!cardcomReturned) return;

    this.cardcomReturnDetected.set(true);
    this.paymentBannerDismissed.set(false);
    this.paymentReturnDetectedAt = Date.now();

    // CardCom convention: ResponseCode/Status === '0' means success.
    const redirectIndicatesFailure =
      (responseCode != null && responseCode !== '0') || (status != null && status !== '0');
    this.cardcomRedirectFailure.set(redirectIndicatesFailure ? { responseCode, status } : null);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });

    this.billingStateService.refreshBillingState().then(() => {
      if (!redirectIndicatesFailure) {
        this.startPaymentTimeoutTimer();
        this.startPaymentResultPolling();
      }
    });
  }

  /**
   * Stop-loss for the "webhook never arrives" failure mode: charge succeeds at
   * CardCom but the webhook is lost (network issue, ngrok down, provider issue),
   * so billing/me never resolves a terminal outcome. Without this, the banner
   * would stay on "processing" forever and the user might pay again, risking a
   * duplicate charge. After PAYMENT_STATUS_TIMEOUT_MS, flip to PAYMENT_STATUS_UNKNOWN.
   */
  private startPaymentTimeoutTimer(): void {
    if (this.paymentTimeoutHandle) clearTimeout(this.paymentTimeoutHandle);
    this.paymentTimedOut.set(false);
    this.paymentTimeoutHandle = setTimeout(() => {
      this.paymentTimedOut.set(true);
    }, this.PAYMENT_STATUS_TIMEOUT_MS);
  }

  /** Bounded poll — webhook may still be finishing receipt generation when the user lands back. */
  private startPaymentResultPolling(): void {
    this.paymentPollAttempts = 0;
    this.pollPaymentResultTick();
  }

  private pollPaymentResultTick(): void {
    const result = this.billingStateService.billingPaymentResult();
    const isFresh =
      !!result &&
      new Date(result.createdAt).getTime() >= this.paymentReturnDetectedAt - this.PAYMENT_FRESHNESS_WINDOW_MS;
    const isDone =
      isFresh &&
      result &&
      (result.paymentStatus === 'FAILED' ||
        result.paymentStatus === 'ACTIVATION_FAILED' ||
        result.receiptDocId != null ||
        result.receiptFailed);

    if (isDone || this.paymentPollAttempts >= this.PAYMENT_POLL_MAX_ATTEMPTS) {
      this.paymentPolling.set(false);
      if (this.paymentTimeoutHandle) {
        clearTimeout(this.paymentTimeoutHandle);
        this.paymentTimeoutHandle = null;
      }
      return;
    }

    this.paymentPolling.set(true);
    this.paymentPollAttempts++;
    setTimeout(() => {
      this.billingStateService.refreshBillingState().finally(() => this.pollPaymentResultTick());
    }, this.PAYMENT_POLL_INTERVAL_MS);
  }

  resendReceiptEmailClick(eventId: number): void {
    this.resendingReceiptEmail.set(true);
    this.billingStateService.resendReceiptEmail(eventId)
      .then(result => {
        if (!result.sent) {
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: result.error ?? 'שליחת החשבונית במייל נכשלה. נסה שוב.',
            life: 5000,
            key: 'br',
          });
        }
      })
      .finally(() => this.resendingReceiptEmail.set(false));
  }

  retryInvoiceClick(eventId: number): void {
    this.retryingInvoice.set(true);
    this.billingStateService.generateMissingReceipt(eventId)
      .then(result => {
        if (!result.sent && !result.created) {
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: result.error ?? 'הפקת החשבונית נכשלה. נסה שוב.',
            life: 5000,
            key: 'br',
          });
        }
      })
      .finally(() => this.retryingInvoice.set(false));
  }

  dismissPaymentResultBanner(): void {
    this.paymentBannerDismissed.set(true);
  }

  /**
   * Polls POST /transactions/post-consent-sync until the UserDataIsAvailable
   * webhook has completed discovery ('completed'), then enables the pull button
   * by flipping the dialog from 'awaiting-webhook' to 'prompt'. Bounded so a
   * lost webhook doesn't spin forever — after MAX_ATTEMPTS we show a failure.
   */
  private pollForWebhookReady(): void {
    this.stopWebhookPoll$.next(); // cancel any previous poll
    const INTERVAL_MS = 4000;
    const MAX_ATTEMPTS = 45; // ~3 min
    let attempt = 0;

    const tick = (): void => {
      attempt++;
      this.syncStatusService.triggerPostConsentSync()
        .pipe(take(1), takeUntil(this.stopWebhookPoll$), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => {
            if (this.feezbackDialogStatus() !== 'awaiting-webhook') return; // dialog moved on
            if (res.status === 'completed') {
              this.feezbackDialogStatus.set('prompt');
              return;
            }
            if (attempt >= MAX_ATTEMPTS) {
              this.feezbackDialogStatus.set('failure');
              this.feezbackDialogIcon.set('error');
              this.feezbackDialogTitle.set('משיכת הנתונים מתעכבת. נסה לרענן בעוד מספר דקות.');
              return;
            }
            setTimeout(tick, INTERVAL_MS);
          },
          error: () => {
            // Transient — keep polling within the attempt budget.
            if (attempt >= MAX_ATTEMPTS || this.feezbackDialogStatus() !== 'awaiting-webhook') {
              return;
            }
            setTimeout(tick, INTERVAL_MS);
          },
        });
    };
    tick();
  }

  /**
   * User clicked "למשיכת התנועות לחץ כאן" in the post-consent prompt dialog.
   * This is now the SOLE entry point for the post-consent transaction pull
   * (the webhook no longer triggers a sync). Flips the dialog to 'loading',
   * fires POST /transactions/trigger-sync, then polls /sync-status until terminal.
   */
  onPullTransactionsClick(): void {
    this.feezbackDialogStatus.set('loading');
    this.feezbackDialogTitle.set('שמחים שהצטרפת לבנקאות הפתוחה!');
    this.feezbackDialogIcon.set(null);

    if (this.pendingPostConsentSimulate) {
      // Dev simulator path — fire Stage C (dev/simulate-pull): prints the real
      // SYNC RESULTS [FULL SYNC] block + seeds the finished sync state, then
      // poll the seeded state to render the terminal dialog.
      console.log('[MyAccount][DevSim] pull clicked — firing simulate-pull then polling seeded state');
      this.syncStatusService.simulatePull(this.pendingPostConsentScenario)
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => this.startSyncStatusPolling(true),
          error: (e) => {
            console.error('[MyAccount][DevSim] simulatePull failed', e);
            this.startSyncStatusPolling(true); // fall back to whatever state exists
          },
        });
      return;
    }

    this.syncStatusService.triggerSync()
      .pipe(take(1))
      .subscribe({
        next: () => {
          // 'started' or 'running' — either way poll /sync-status until terminal.
          this.startSyncStatusPolling(true);
        },
        error: (err) => {
          console.error('[MyAccount] post-consent triggerSync failed:', err);
          // Cancel any background polling so it can't race and override 'failure'.
          this.restartPolling$.next();
          const code = err?.error?.code;
          this.feezbackDialogStatus.set('failure');
          this.feezbackDialogIcon.set('error');
          this.feezbackDialogTitle.set(
            code === 'feezback_unavailable'
              ? 'שירות הבנקאות הפתוחה אינו זמין כעת. אנא נסה שוב בעוד מספר דקות.'
              : 'משהו בטעינת הנתונים השתבש בדרך',
          );
        },
      });
  }

  closeFeezbackDialog(): void {
    if (this.feezbackDialogStatus() === 'loading') return;
    this.stopWebhookPoll$.next(); // stop the awaiting-webhook poll if active
    this.feezbackDialogVisible.set(false);
    this.feezbackDialogStatus.set(null);
    this.feezbackDialogTitle.set('');
    this.feezbackDialogIcon.set(null);
  }

  /**
   * Single source of truth for the terminal dialog title + icon.
   * Inspects the per-source results and picks one of:
   *   - all-success      → success title + success icon
   *   - any consent gap  → "לא התקבל אישור עבור חלק מהחשבונות" + warning icon
   *   - sync errors only → "משהו בטעינת הנתונים השתבש בדרך" + error icon
   *   - no sources       → generic success ("הפעולה הסתיימה בהצלחה")
   */
  private applyTerminalDialogState(): void {
    const rows = this.syncSourceResults();
    if (rows.length === 0) {
      this.feezbackDialogStatus.set('success');
      this.feezbackDialogTitle.set('הפעולה הסתיימה בהצלחה');
      this.feezbackDialogIcon.set('success');
      return;
    }
    const allSuccess = rows.every(r => r.status === 'success');
    if (allSuccess) {
      this.feezbackDialogStatus.set('success');
      this.feezbackDialogTitle.set('הנתונים שלך נטענו בהצלחה!');
      this.feezbackDialogIcon.set('success');
      return;
    }
    const errorType = this.dialogErrorType();
    this.feezbackDialogStatus.set('failure');
    if (errorType === 'consent') {
      this.feezbackDialogTitle.set('לא התקבל אישור עבור חלק מהחשבונות');
      this.feezbackDialogIcon.set('warning');
    } else {
      this.feezbackDialogTitle.set('משהו בטעינת הנתונים השתבש בדרך');
      this.feezbackDialogIcon.set('error');
    }
  }

  onRenewConsent(): void {
    if (this.feezbackDialogVisible()) this.closeFeezbackDialog();
    this.connectToOpenBanking();
  }

  tryAgainFromDialog(): void {
    this.feezbackDialogStatus.set('loading');
    this.feezbackDialogTitle.set('שמחים שהצטרפת לבנקאות הפתוחה!');
    this.feezbackDialogIcon.set(null);
    this.syncSourceResults.set([]);
    this.syncStatusService.triggerSync()
      .pipe(take(1))
      .subscribe({
        next: () => this.startSyncStatusPolling(true),
        error: (err) => {
          console.error('[MyAccount] tryAgainFromDialog triggerSync failed:', err);
          this.feezbackDialogStatus.set('failure');
          this.feezbackDialogTitle.set('משהו בטעינת הנתונים השתבש בדרך');
          this.feezbackDialogIcon.set('error');
        },
      });
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
  /**
   * @param requireRunningFirst  When true (explicit sync trigger / feezback return),
   *   ignore 'completed'/'failed' until we have first seen 'running' — avoids acting
   *   on stale terminal state left over from a previous sync.
   *   When false (page load / navigation back), act on whatever the current state is.
   */
  private startSyncStatusPolling(requireRunningFirst = false): void {
    // Cancels any previous polling session before starting a new one.
    this.restartPolling$.next();

    let hasFetched = false;
    let seenRunning = false;

    // A terminal state whose finishedAt is within 15 min is considered "this session".
    // This handles the case where the webhook sync completes before the user returns
    // from the Feezback portal — we must accept that completed state rather than waiting
    // for a 'running' signal that will never come.
    const isRecentFinish = (finishedAt: string | null): boolean =>
      !!finishedAt && (Date.now() - new Date(finishedAt).getTime()) < 15 * 60_000;

    this.syncStatusService.getSyncStageStream()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        takeUntil(this.restartPolling$),
        takeWhile(
          ({ stageState }) =>
            !stageState ||
            stageState.processStatus === 'running' ||
            (requireRunningFirst && !seenRunning && !isRecentFinish(stageState.finishedAt)),
          /* inclusive */ true,
        ),
        catchError(err => {
          console.warn('[MyAccount] Sync status stream error — treating as failed', err);
          this.syncProcessStatus.set('failed');
          this.transToClassify = of([]);
          if (this.feezbackDialogVisible() && this.feezbackDialogStatus() === 'loading') {
            this.feezbackDialogStatus.set('failure');
            this.feezbackDialogTitle.set('משהו בדרך השתבש, אנא נסה שנית');
            this.feezbackDialogIcon.set('error');
          }
          return EMPTY;
        }),
      )
      .subscribe(({ stageState, sourceResults }) => {
        this.syncSourceResults.set(sourceResults);
        if (!stageState) {
          // null = transient HTTP error during polling — keep current state, don't fail
          return;
        }

        const status = stageState.processStatus;
        console.log(`[MyAccount] poll status=${status} skipReason=${stageState.skipReason} hasFetched=${hasFetched}`);

        if (status === 'running') {
          seenRunning = true;
          hasFetched = false; // reset so refetch happens after sync completes
          this.syncProcessStatus.set('running');
          this.syncSourceResults.set([]);
          this.syncRanThisSession.set(true);
        } else if (status === 'completed') {
          if (requireRunningFirst && !seenRunning && !isRecentFinish(stageState.finishedAt)) return; // stale — keep polling
          this.syncProcessStatus.set(null);
          if (this.feezbackDialogVisible() &&
              (this.feezbackDialogStatus() === 'loading' || this.feezbackDialogStatus() === 'failure')) {
            this.applyTerminalDialogState();
          }
          if (!hasFetched) {
            hasFetched = true;
            this.getTransToClassify();
          }
          if (stageState.failureReason) {
            this.messageService.add({
              severity: 'warn',
              summary: 'סנכרון חלקי',
              detail: this.buildPartialSyncMessage(stageState.failureReason),
              life: 10_000,
              key: 'br',
            });
          }
        } else if (status === 'failed') {
          if (requireRunningFirst && !seenRunning && !isRecentFinish(stageState.finishedAt)) return; // stale — keep polling
          this.syncProcessStatus.set('failed');
          this.transToClassify = of([]);
          if (this.feezbackDialogVisible() && this.feezbackDialogStatus() === 'loading') {
            this.applyTerminalDialogState();
            // Restart polling (without requireRunningFirst) to catch the subsequent login sync
            if (requireRunningFirst) {
              setTimeout(() => this.startSyncStatusPolling(false), 3000);
            }
          }
        } else if (status === 'skipped') {
          // 'cache_exists' → data already in DB → fetch it.
          // 'no_access'    → user has no open banking → show empty state.
          this.syncProcessStatus.set(null);
          if (stageState.skipReason === 'cache_exists' && !hasFetched) {
            hasFetched = true;
            this.getTransToClassify();
          }
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
        next: () => this.startSyncStatusPolling(true),
        error: (err) => {
          console.error('[MyAccount] triggerSync failed during retry:', err);
          this.syncProcessStatus.set('failed');
          this.transToClassify = of([]);
        },
      });
  }
  onRetrySource(type: 'bank' | 'card', sourceId: string): void {
    this.isRetryingSource.set(sourceId);
    this.syncStatusService.retrySource(type, sourceId)
      .pipe(
        catchError(err => {
          console.error('[MyAccount] retrySource failed:', err);
          // Backend returns 409 when a full sync is in progress — the retry
          // wasn't a failure, just deferred. Use a softer 'warn' tone and a
          // clearer message so the user knows to wait, not panic.
          const isAlreadyRunning = err?.status === 409;
          this.messageService.add({
            severity: isAlreadyRunning ? 'warn' : 'error',
            summary: isAlreadyRunning ? 'התראה' : 'שגיאה',
            detail: isAlreadyRunning
              ? 'סנכרון כבר פועל — המתן לסיומו'
              : 'הניסיון לסנכרן מחדש נכשל',
            life: 5000,
            key: 'br',
          });
          return EMPTY;
        }),
        finalize(() => this.isRetryingSource.set(null)),
      )
      .subscribe(result => {
        this.syncSourceResults.update(results =>
          results.map(r => r.sourceId === sourceId ? result : r)
        );
        if (this.feezbackDialogVisible() && this.feezbackDialogStatus() === 'failure') {
          // Re-classify after the retry — may flip to success, or stay failure with
          // a different error type (e.g. consent gap that wasn't addressed).
          this.applyTerminalDialogState();
        }
        if (result.status === 'success' && !result.error) {
          this.getTransToClassify();
        }
      });
  }

  // ─── Row-action handlers ──────────────────────────────────────────────────

  onAssociateAccount(row: IRowDataTable): void {
    this.visibleAccountAssociationDialog.set(true);
    this.leftPanelData.set(row);
  }

  onClassifyTransaction(row: IRowDataTable): void {
    const rawBn = row?.['__businessNumberRaw'];
    if (rawBn != null && String(rawBn).trim() !== '') {
      this.authService.setActiveBusinessNumber(String(rawBn));
    } else {
      this.authService.setActiveBusinessNumberByName(row.businessNumber as string);
    }
    this.visibleClassifyTran.set(true);
    this.leftPanelData.set(row);
    // Positive sum is income; zero/negative is expense.
    const sumNumeric =
      typeof row?.['__sumNumeric'] === 'number'
        ? row['__sumNumeric']
        : Number(row?.sum ?? 0);
    this.incomeMode.set(sumNumeric > 0);
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
            .map(row => {
              const n = Number(row.sum);
              const rawBn = row?.businessNumber;
              const currencySymbol = this.getCurrencySymbol((row as any).currency);
              return {
                ...row,
                __businessNumberRaw:
                  rawBn != null && rawBn !== '' ? String(rawBn) : undefined,
                sum: `${currencySymbol}${this.genericService.addComma(Math.abs(n))}`,
                __sumNumeric: n,
                businessNumber:
                  rawBn === this.userData?.businessNumber
                    ? this.userData?.businessName
                    : this.userData?.spouseBusinessName,
              };
            }) as unknown as ITransactionData[]
        )
      );
  }

  private getCurrencySymbol(currency: string | null | undefined): string {
    switch (currency) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'ILS':
      default: return '₪';
    }
  }

  openAddExpensesPage(): void {

  }

  connectToOpenBanking(): void {
    const result = this.accessHandlerService.handleFeatureAccess(AppFeature.OPEN_BANKING_CONNECT);
    if (!result.allowed) return;
    this.consentChecked.set(false);
    this.consentDialogVisible.set(true);
  }

  confirmConsentAndConnect(): void {
    this.consentDialogVisible.set(false);
    this.doConnectToOpenBanking();
  }

  private doConnectToOpenBanking(): void {
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
          window.location.assign(link);
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

  private buildPartialSyncMessage(failureReason: string): string {
    const parts: string[] = [];
    if (failureReason.includes('card_errors')) {
      const match = failureReason.match(/card_errors:(\d+)/);
      const count = match?.[1] ?? '';
      parts.push(`${count ? count + ' ' : ''}כרטיסי אשראי לא סונכרנו בהצלחה`);
    }
    if (failureReason.includes('bank_accounts_failed')) {
      const match = failureReason.match(/bank_accounts_failed:(\d+)/);
      const count = match?.[1] ?? '';
      parts.push(`${count ? count + ' ' : ''}חשבונות בנק לא סונכרנו בהצלחה`);
    }
    if (failureReason.includes('bank_consent_required')) {
      parts.push('לא נמצאה הרשאה לחשבונות בנק');
    }
    return parts.length > 0
      ? parts.join(', ') + '. שאר הנתונים נטענו בהצלחה.'
      : 'חלק מהנתונים לא נטענו בהצלחה.';
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


  /**
   * Wipes the demo user's Drive inbox/processed/archive folders, deletes
   * all OCR/expense/transaction rows derived from prior testing, then
   * re-uploads the canned sample PDFs and re-seeds the OB cache rows from
   * the profile. Visible only when `userData.isDemo` is true. After the
   * server confirms, force a full reload so every cached signal/state in
   * the SPA picks up the fresh DB.
   */
  onResetTestData(): void {
    if (this.isResettingDemo()) return;
    const confirmed = confirm(
      'פעולה זו תמחק את כל קבצי הדרייב והנתונים שנוצרו במהלך הבדיקות ותעלה מחדש את קבצי הדוגמה. להמשיך?',
    );
    if (!confirmed) return;
    this.isResettingDemo.set(true);
    this.adminPanelService.resetDemoTestData().subscribe({
      next: (res) => {
        if (res.driveInbox?.needsManualUpload) {
          // Drive's service account couldn't upload (no storage quota on
          // personal Google accounts). Tell the admin to drag the PDFs in
          // by hand and open the inbox folder in a new tab so they can.
          this.messageService.add({
            severity: 'warn',
            summary: 'איפוס בוצע - יש לעלות קבצים ידנית',
            detail: `נמחקו ${res.filesDeleted} קבצים. יש לגרור את קבצי הדוגמה לתיקיית ה-inbox בדרייב (נפתחה בכרטיסיה חדשה).`,
            life: 8000,
          });
          window.open(res.driveInbox.inboxFolderUrl, '_blank');
          // Don't reload — give the admin time to drop the files first.
          this.isResettingDemo.set(false);
          return;
        }
        this.messageService.add({
          severity: 'success',
          summary: 'אופס נתוני הבדיקה',
          detail: `נמחקו ${res.filesDeleted} קבצים, הועלו ${res.filesUploaded} מחדש`,
          life: 3000,
        });
        // Full reload so userData, signals, OCR cache, transactions table
        // all re-fetch from the now-clean backend.
        setTimeout(() => window.location.reload(), 600);
      },
      error: (err) => {
        console.error('resetDemoTestData failed', err);
        this.isResettingDemo.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'איפוס נתוני בדיקה נכשל',
          detail: err?.error?.message ?? 'שגיאה לא צפויה',
          life: 4000,
        });
      },
    });
  }

  openMannualExpenses(): void {
    const result = this.accessHandlerService.handleFeatureAccess(AppFeature.ADD_EXPENSE_BUTTON);
    if (!result.allowed) return;
    this.dialogService.open(MannualExpenseComponent, {
      header: 'הוספת הוצאה ידנית',
      width: '480px',
      style: { maxWidth: '95vw' },
      rtl: true,
      closable: true,
      dismissableMask: true,
      modal: true,
    });
  }
}
