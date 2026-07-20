import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd, NavigationError } from '@angular/router';
import { IColumnDataTable, IRowDataTable, IUserData } from './shared/interface';
import { Location } from '@angular/common';
import { LoadingController, ModalController, PopoverController } from '@ionic/angular';
import { AuthService } from './services/auth.service';
import { ClientPanelService } from './services/clients-panel.service';
import { ExpenseDataService } from './services/expense-data.service';
import { ModalExpensesComponent } from './shared/modal-add-expenses/modal.component';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from './shared/enums';
import { catchError, EMPTY, finalize, from, map, Observable, Subject, switchMap } from 'rxjs';
import { filter, pairwise, takeUntil } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { GenericService } from './services/generic.service';
import { BillingStateService, BILLING_BLOCKING_STATUSES } from './services/billing-state.service';
import { AccessService } from './services/access.service';
import { AppFeature } from './shared/access-control';
import { NetworkStatusService } from './services/pwa/network-status.service';
import { AppRefreshService } from './services/pwa/app-refresh.service';



@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,

})
export class AppComponent implements OnInit {

  protected genericService = inject(GenericService);
  protected billingStateService = inject(BillingStateService);
  private readonly accessService = inject(AccessService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly appRefresh = inject(AppRefreshService);

  // Tracks the settled URL after each navigation — drives billing dialog visibility.
  private readonly currentUrl = signal<string>('');

  // Show the blocking billing dialog when the backend reports a blocking status,
  // but never on auth or billing routes (avoids dialog-loop when navigating to /billing/plans).
  protected readonly showBillingDialog = computed(() => {
    const url = this.currentUrl();
    if (!url || ['/login', '/register'].includes(url) || url.startsWith('/billing')) {
      return false;
    }
    if (
      !this.billingStateService.billingState() ||
      this.billingStateService.isLoading() ||
      this.billingStateService.error()
    ) {
      return false;
    }
    const status = this.billingStateService.billingState()?.subscription?.status;
    return !!status && BILLING_BLOCKING_STATUSES.includes(status);
  });

  // Dialog copy — driven by the subscription status returned from the backend.
  protected readonly billingDialogContent = computed(() => {
    const status = this.billingStateService.billingState()?.subscription?.status;
    const map: Record<string, { title: string; message: string; buttonLabel: string }> = {
      TRIAL_EXPIRED: {
        title: 'תקופת הניסיון הסתיימה',
        message: 'תקופת הניסיון שלך הסתיימה.\nכדי להמשיך להשתמש במערכת יש לבחור תוכנית ולהסדיר תשלום.',
        buttonLabel: 'בחירת תוכנית',
      },
      PAST_DUE: {
        title: 'קיימת בעיה בתשלום',
        message: 'לא הצלחנו לחייב את אמצעי התשלום שלך.\nיש לעדכן תשלום כדי להמשיך להשתמש במערכת.',
        buttonLabel: 'עדכון תשלום',
      },
      CANCELED: {
        title: 'המנוי אינו פעיל',
        message: 'המנוי שלך אינו פעיל כרגע.\nבחר תוכנית חדשה כדי להמשיך להשתמש במערכת.',
        buttonLabel: 'בחירת תוכנית',
      },
    };
    return map[status!] ?? { title: '', message: '', buttonLabel: '' };
  });

  public appPages = [
    //{ title: 'דף-הבית', url: 'home', icon: 'home' },
    { title: 'פאנל ניהול', url: 'admin-panel', icon: 'settings' },
    { title: 'הלקוחות שלי', url: 'client-panel', icon: 'settings' },
    { title: 'איזור אישי', url: 'my-account', icon: 'person-circle' },
    { title: 'הענן שלי', url: 'my-storage', icon: 'cloud-download' },
    { title: ' הגשת דוחות', url: 'reports', icon: 'documents' },
    //{ title: ' הפקת מסמך', url: 'doc-create', icon: 'documents' },
    { title: 'הוספת חשבונית', url: 'add-expenses', icon: 'cloud-upload' },
    { title: 'תזרים', url: 'transactions', icon: 'swap-vertical' },
    //{ title: 'יעוץ פיננסי', url: 'spam', icon: 'chatbubbles' },
    //{ title: 'הרשמה', url: 'register', icon: 'log-in' },
    { title: 'כניסה', url: 'login', icon: 'log-in' },
    //{ title: 'logOut', url: 'login', icon: 'log-out' },
    //{ title: 'דו"ח שנתי', url: 'annual-report', icon: 'chatbubbles' },
    //{ title: 'דו"ח מע"מ', url: 'vat-report', icon: 'chatbubbles' },

  ];


  private readonly _isUserAdmin = signal<boolean>(false);
  private readonly _isAccountant = signal<boolean>(false);

  /** Reactive menu: filters access-gated items (e.g. תזרים) and role-based items reactively. */
  readonly menuItems = computed(() => {
    const showTransactions = this.accessService.getFeatureState(AppFeature.TRANSACTIONS_TAB_PIVOT).visible;
    const hasBusiness = this.genericService.businesses().length > 0;

    const items = [
      { label: 'דף הבית', routerLink: '/my-account' },
      ...(showTransactions ? [{ label: 'תזרים', routerLink: '/transactions' }] : []),
      { label: 'דוחות', routerLink: '/reports' },
      ...(hasBusiness ? [{ label: 'הנהלת חשבונות', routerLink: '/book-keeping' }] : []),
      { label: 'ניתוח הוצאות', routerLink: '/flow-analysis' },
      ...(this._isUserAdmin() ? [{ label: 'פאנל ניהול', routerLink: '/admin-panel' }] : []),
      ...(this._isAccountant() ? [{ label: 'משרד', routerLink: '/client-panel' }] : []),
    ];
    return items;
  });

  fromLoginPage = false; // Flag to check if entry was from login page
  showMenu: boolean = false;
  columns: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[]; // Titles of expense // TODO: remove?
  userData: IUserData;
  /**
   * The *real* logged-in user (admin or accountant), independent of any view-as
   * overlay. `userData` above may temporarily reflect the demo user / client
   * being viewed; `realUserData` always reflects who actually holds the session.
   * Used by the top banner so it labels things from the real user's perspective.
   */
  realUserData: IUserData | null = null;
  isUserAdmin: boolean = false;
  isAccountant: boolean = false;
  destroy$ = new Subject<void>();
  /** כשהרואה חשבון נכנס לחשבון לקוח – לתצוגה בראש המסך */
  selectedClientId: string | null = null;
  selectedClientName: string | null = null;

  constructor(
    private expenseDataServise: ExpenseDataService,
    private router: Router,
    private modalCtrl: ModalController,
    public authService: AuthService,
    private messageService: MessageService,
    private clientPanelService: ClientPanelService,
  ) {
    this.recoverOnReconnect();
  }
  showTopNav = signal(true);

  /**
   * When connectivity returns, re-fetch shared state so the app stops showing
   * whatever failed to load during the outage.
   *
   * Only the allow-listed idempotent GETs in AppRefreshService run — no failed
   * request is replayed and no mutation is ever repeated. `reconnectedAt`
   * changes once per outage, so this fires once, not on every network event.
   */
  private recoverOnReconnect(): void {
    effect(() => {
      const reconnectedAt = this.networkStatus.reconnectedAt();
      if (reconnectedAt === 0) {
        return; // Initial value — no outage has ended yet.
      }
      void this.appRefresh.refreshSharedState();
    });
  }

  ngOnInit() {
    this.currentUrl.set(this.router.url);
    this.handleChunkLoadErrors();
    this.hideTopNav();
    this.subscribeToSelectedClient();
    this.restoreSessionAfterRefresh();
    // Check admin status after userData is loaded
    this.updateAdminMenuItems();
    this.getRoute();
    this.getRoleUser();
  }

  /**
   * Recover from stale lazy-chunk failures after a deploy. Every page is a
   * content-hashed `loadChildren` chunk; when a new build ships, the old chunk
   * filenames are gone. A browser still running the previous app then fails to
   * load the chunk for a not-yet-visited route (e.g. הנהלת חשבונות) and the
   * navigation errors out. We detect that specific NavigationError and do ONE
   * full reload to the target URL — which now fetches a fresh, no-cache
   * index.html plus the current chunk hashes (see firebase.json Cache-Control).
   * A sessionStorage guard prevents reload loops when the failure is NOT
   * deploy-related (e.g. genuinely offline).
   */
  private handleChunkLoadErrors(): void {
    const GUARD_KEY = 'chunkReloadFor';

    this.router.events
      .pipe(
        filter(e => e instanceof NavigationError),
        takeUntil(this.destroy$),
      )
      .subscribe((e: NavigationError) => {
        const message = String((e.error as any)?.message ?? e.error ?? '');
        const isChunkError = /ChunkLoadError|Loading chunk [\w-]+ failed|dynamically imported module|Importing a module script failed/i.test(message);
        if (!isChunkError) return;

        // Already reloaded once for this URL and it still failed → stop, so we
        // don't loop forever (the real problem is something else).
        if (sessionStorage.getItem(GUARD_KEY) === e.url) return;

        sessionStorage.setItem(GUARD_KEY, e.url);
        // Full reload to the intended route — pulls the fresh shell + chunks.
        window.location.assign(e.url);
      });

    // Clear the guard once any navigation succeeds, so a future deploy can
    // trigger a fresh recovery reload.
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntil(this.destroy$),
      )
      .subscribe(() => sessionStorage.removeItem(GUARD_KEY));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    //this.authService.stopTokenRefresh(); // Clean up on app component destruction
  }

  restartData(): void {
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.realUserData = this.authService.getRealUserDataFromLocalStorage();
    this.updateAdminMenuItems();
    this.getRoleUser();
  }

  /** True when the *real* logged-in user is an admin (regardless of view-as state). */
  realUserIsAdmin(): boolean {
    return !!this.realUserData?.role?.includes('ADMIN');
  }

  hideTopNav(): void {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe((e: NavigationEnd) => {
      const url = e.urlAfterRedirects || e.url;
      this.currentUrl.set(url);
      this.showTopNav.set(!(['/login', '/register'].includes(url)));
      // עדכון תפריט (כולל משרד לרואה חשבון) בכל ניווט – כך שהטאב יופיע גם אחרי כניסה מהדף לוגין
      const userFromStorage = this.authService.getUserDataFromLocalStorage();
      if (userFromStorage) {
        this.userData = userFromStorage;
        this.realUserData = this.authService.getRealUserDataFromLocalStorage();
        this.updateAdminMenuItems();
        this.getRoleUser();
      }
      // Re-sync banner state with sessionStorage (source of truth). Defensive
      // against missed BehaviorSubject emissions / race conditions when entering
      // a view-as user (e.g. demo-data flow).
      const persistedClientId = this.clientPanelService.getSelectedClientId();
      if (persistedClientId !== this.selectedClientId) {
        console.log('[AppComponent] re-syncing selectedClientId from sessionStorage:', { previous: this.selectedClientId, next: persistedClientId, url });
        this.selectedClientId = persistedClientId;
        this.selectedClientName = persistedClientId
          ? this.clientPanelService.getSelectedClientName()
          : null;
      }
    });
  }

  getRoute(): void {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        pairwise() // Gives an array [previous, current] NavigationEnd events
      )
      .subscribe(([previous, current]: [NavigationEnd, NavigationEnd]) => {
        // Check if previous route was the login page
        if (previous.urlAfterRedirects === '/login') {
          this.fromLoginPage = true;
          this.onAppEntryFromLogin();
        } else {
          this.fromLoginPage = false;
        }
      });

  }

  onAppEntryFromLogin() {
    if (this.fromLoginPage) {
      this.restartData();
      // Only fetch billing state for an authenticated user — navigating from
      // /login to a public route (e.g. /register) leaves no Firebase user,
      // so billing/me would 401 and the AuthErrorInterceptor would bounce
      // the user straight back to /login.
      if (this.authService.isLoggedIn) {
        this.triggerBillingLoad();
      }
    }
  }

  getRoleUser(): void {
    this.isUserAdmin = this.userData?.role?.includes('ADMIN') || false;
    this.isAccountant = this.userData?.role?.includes('ACCOUNTANT') || false;
  }

  openModalAddExpense() {

    this.expenseDataServise.openModalAddExpense()
      .pipe(
        takeUntil(this.destroy$)
      )
      .subscribe()

  }

  /**
   * Exit the "acting as another user" view. Admins go back to /admin-panel,
   * accountants go back to /client-panel.
   */
  exitClientView(): void {
    this.clientPanelService.clearSelectedClient();
    const realUser = this.authService.getRealUserDataFromLocalStorage();
    const destination = realUser?.role?.includes('ADMIN') ? '/admin-panel' : '/client-panel';
    this.router.navigate([destination]);
  }

  private subscribeToSelectedClient(): void {
    this.clientPanelService.selectedClientId$.pipe(takeUntil(this.destroy$)).subscribe((id) => {
      console.log('[AppComponent] selectedClientId$ emission:', { id, persisted: this.clientPanelService.getSelectedClientId() });
      this.selectedClientId = id;
      this.selectedClientName = id ? this.clientPanelService.getSelectedClientName() : null;
      // Billing/module-access state is per-identity (BillingStateService caches
      // it until explicitly refreshed) — without this, every module-gated tab
      // and route (book-keeping/expenses, book-keeping/incomes, transactions...)
      // keeps evaluating against whichever identity's billing state loaded
      // first, so entering or exiting client view silently shows the wrong
      // person's access instead of "exactly what the client sees".
      this.billingStateService.refreshBillingState();
      if (id) {
        this.authService.loadViewAsUserData().subscribe((data) => {
          if (data) {
            this.userData = data;
            this.updateAdminMenuItems();
            this.getRoleUser();
          }
        });
        this.genericService.loadBusinessesFromServer().then(() => this.updateAdminMenuItems());
      } else {
        this.authService.clearViewAsUserData();
        this.genericService.loadBusinessesFromServer().then(() => this.updateAdminMenuItems());
        this.userData = this.authService.getUserDataFromLocalStorage();
        this.updateAdminMenuItems();
        this.getRoleUser();
      }
    });
    this.clientPanelService.selectedClientName$.pipe(takeUntil(this.destroy$)).subscribe((name) => {
      this.selectedClientName = name;
    });
  }

  toggleMenu() {
    this.showMenu = !this.showMenu;
  }

  showMessage(severity: string, summary: string, detail: string, life: number) {
    this.messageService.add({
      severity,
      summary,
      detail,
      key: 'br',
      life
    });
  }

  async restoreSessionAfterRefresh() {
    const userData = this.authService.getUserDataFromLocalStorage();
    if (userData) {
      this.userData = userData;
      this.realUserData = this.authService.getRealUserDataFromLocalStorage();
      // Update admin menu items after userData is set
      this.updateAdminMenuItems();
      // await this.genericService.loadBusinesses();
      this.triggerBillingLoad();
    }
  }

  navigateToBillingPlans(): void {
    this.router.navigate(['/billing/plans']);
  }

  // Fire-and-forget billing state load. Shows a toast on network errors.
  // The `isLoading` guard inside loadBillingState prevents duplicate requests.
  private triggerBillingLoad(): void {
    this.billingStateService.loadBillingState().then(() => {
      const err = this.billingStateService.error();
      if (err) {
        this.genericService.showToast(err, 'error');
      }
    });
  }

  updateAdminMenuItems(): void {
    const role = this.userData?.role;
    this._isUserAdmin.set(!!(role && (role[0] === 'ADMIN' || role.includes('ADMIN'))));
    this._isAccountant.set(!!role?.includes('ACCOUNTANT'));
    // isUserAdmin / isAccountant are kept in sync for any remaining non-template usages.
    this.isUserAdmin = this._isUserAdmin();
    this.isAccountant = this._isAccountant();
  }

}