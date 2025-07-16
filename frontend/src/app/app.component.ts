import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { IColumnDataTable, IRowDataTable, IUserData } from './shared/interface';
import { Location } from '@angular/common';
import { LoadingController, ModalController, PopoverController } from '@ionic/angular';
import { AuthService } from './services/auth.service';
import { ExpenseDataService } from './services/expense-data.service';
import { ModalExpensesComponent } from './shared/modal-add-expenses/modal.component';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from './shared/enums';
import { catchError, EMPTY, finalize, from, map, Observable, Subject, switchMap } from 'rxjs';
import { filter, pairwise, takeUntil } from 'rxjs/operators';
import { MessageService } from 'primeng/api';



@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,

})
export class AppComponent implements OnInit {

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
    // { label: 'הגדרות', routerLink: '/my-status' },
    // { label: 'צור קשר' },
  ]

  fromLoginPage = false; // Flag to check if entry was from login page
  isPopoverOpen: boolean = false;
  showMenu: boolean = false;
  columns: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[]; // Titles of expense // TODO: remove?
  userData: IUserData;
  isUserAdmin: boolean = false;
  isAccountant: boolean = false;
  destroy$ = new Subject<void>();

  constructor(private expenseDataServise: ExpenseDataService, private router: Router, private modalCtrl: ModalController, private authService: AuthService, private messageService: MessageService) {
  };
  showTopNav = signal(true);
  ngOnInit() {
    this.hideTopNav();
    this.userData = this.authService.getUserDataFromLocalStorage();
    if (this.userData?.role[0] === 'ADMIN') {
      this.menuItems.push({ label: 'פאנל ניהול', routerLink: '/admin-panel' });
      this.menuItems.push({ label: 'כניסה', routerLink: '/login' });
    }
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
    if (this.userData?.role[0] === 'ADMIN') {
      const panelExist = this.menuItems.some(item => item.label === 'פאנל ניהול');
      // If 'פאנל ניהול' is not already in the menuItems, add it
      if (!panelExist) {
        this.menuItems.push({ label: 'פאנל ניהול', routerLink: '/admin-panel' });
      }
    }
    else {
      // If user is not admin, ensure 'פאנל ניהול' is removed
      this.menuItems = this.menuItems.filter(item => item.label !== 'פאנל ניהול');
    }
    this.getRoleUser();
  }

  hideTopNav(): void {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: NavigationEnd) => {
      const url = e.urlAfterRedirects || e.url;
      this.showTopNav.set(!(['/login', '/register'].includes(url)));
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

    // if (this.userData?.role === 'ADMIN') {
    //   this.isUserAdmin = true;
    // }
    // else {
    //   this.isUserAdmin = false
    // }

    // if (this.userData?.role === 'ACCOUNTANT') {
    //   this.isAccountant = true;
    // }
    // else {
    //   this.isAccountant = false
    // }

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
    // const modal = await this.modalCtrl.create({
    //   component: ModalExpensesComponent,
    //   componentProps: {
    //     columns: this.columns,
    //     data: {},
    //   },
    //   cssClass: 'expense-modal'
    // })
    // await modal.present();
  }

  async signOut() {
    console.log("sign out");
    await this.authService.SignOut();
    this.isPopoverOpen = !this.isPopoverOpen
    this.router.navigate(["/login"])

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

}
