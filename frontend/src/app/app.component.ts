import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
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



@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,

})
export class AppComponent implements OnInit {

  protected genericService = inject(GenericService);

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


  menuItems = [
    { label: 'דף הבית', routerLink: '/my-account' },
    // { label: 'פרופיל אישי' },
    { label: 'תזרים', routerLink: '/transactions' },
    { label: 'דוחות', routerLink: '/reports' },
    { label: 'הנהלת חשבונות', routerLink: '/book-keeping' },
    { label: 'ניתוח הוצאות', routerLink: '/flow-analysis' },
    // { label: 'צור קשר' },
  ]

  fromLoginPage = false; // Flag to check if entry was from login page
  isPopoverOpen: boolean = false;
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
    private authService: AuthService,
    private messageService: MessageService,
    private clientPanelService: ClientPanelService,
  ) {}
  showTopNav = signal(true);

  ngOnInit() {
    this.hideTopNav();
    this.subscribeToSelectedClient();
    this.restoreSessionAfterRefresh();
    // Check admin status after userData is loaded
    this.updateAdminMenuItems();
    this.getRoute();
    this.getRoleUser();
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
      // this.ngOnInit();
      this.restartData();
    }
  }

  getRoleUser(): void {
    this.isUserAdmin = this.userData?.role?.includes('ADMIN') || false;
    this.isAccountant = this.userData?.role?.includes('ACCOUNTANT') || false;
  }

  openCloseLogOutPopup() {
    console.log("popover open");
    this.isPopoverOpen = !this.isPopoverOpen
    console.log(this.isPopoverOpen);
  }

  openModalAddExpense() {

    this.expenseDataServise.openModalAddExpense()
      .pipe(
        takeUntil(this.destroy$)
      )
      .subscribe()

  }

  async signOut() {
    console.log("sign out");
    this.clientPanelService.clearSelectedClient();
    await this.authService.SignOut();
    this.isPopoverOpen = !this.isPopoverOpen;
    this.router.navigate(["/login"]);
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
    }
  }

  updateAdminMenuItems(): void {
    const role = this.userData?.role;

    // Remove role-based items so we can re-add according to current user.
    // Also drop "הנהלת חשבונות" — it's re-added below only when the user
    // has at least one business (no business → hide the tab).
    this.menuItems = this.menuItems.filter(
      (item) => item.label !== 'פאנל ניהול'
             && item.label !== 'משרד'
             && item.label !== 'הנהלת חשבונות',
    );

    // "הנהלת חשבונות" — visible only when the user has ≥1 business.
    // Insert between "דוחות" and "ניתוח הוצאות" to preserve the menu order.
    if (this.genericService.businesses().length > 0) {
      const flowAnalysisIdx = this.menuItems.findIndex((i) => i.label === 'ניתוח הוצאות');
      const bookKeepingItem = { label: 'הנהלת חשבונות', routerLink: '/book-keeping' };
      if (flowAnalysisIdx >= 0) {
        this.menuItems.splice(flowAnalysisIdx, 0, bookKeepingItem);
      } else {
        this.menuItems.push(bookKeepingItem);
      }
    }

    if (role && (role[0] === 'ADMIN' || role.includes('ADMIN'))) {
      if (!this.menuItems.some((item) => item.label === 'פאנל ניהול')) {
        this.menuItems.push({ label: 'פאנל ניהול', routerLink: '/admin-panel' });
      }
    }
    // טאב משרד לרואה חשבון – הלקוחות שלי + הקמת לקוח
    if (role?.includes('ACCOUNTANT')) {
      if (!this.menuItems.some((item) => item.label === 'משרד')) {
        this.menuItems.push({ label: 'משרד', routerLink: '/client-panel' });
      }
    }
  }

}