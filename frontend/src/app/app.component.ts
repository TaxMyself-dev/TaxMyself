import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { IColumnDataTable, IRowDataTable, IUserDate } from './shared/interface';
import { Location } from '@angular/common';
import { LoadingController, ModalController, PopoverController } from '@ionic/angular';
import { AuthService } from './services/auth.service';
import { ExpenseDataService } from './services/expense-data.service';
import { ModalExpensesComponent } from './shared/modal-add-expenses/modal.component';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from './shared/enums';
import { catchError, EMPTY, finalize, from, map, Observable, switchMap } from 'rxjs';
import { filter, pairwise } from 'rxjs/operators';



@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss']
})
export class AppComponent implements OnInit {

  public appPages = [
    //{ title: 'דף-הבית', url: 'home', icon: 'home' },
    { title: 'פאנל ניהול', url: 'admin-panel', icon: 'settings' },
    { title: 'איזור אישי', url: 'my-account', icon: 'person-circle' },
    { title: 'הענן שלי', url: 'my-storage', icon: 'cloud-download' },
    { title: ' הגשת דוחות', url: 'reports', icon: 'documents' },
    { title: 'הוספת חשבונית', url: 'add-expenses', icon: 'cloud-upload' },
    { title: 'תזרים', url: 'transactions', icon: 'swap-vertical' },
    //{ title: 'יעוץ פיננסי', url: 'spam', icon: 'chatbubbles' },
    //{ title: 'הרשמה', url: 'register', icon: 'log-in' },
    { title: 'כניסה', url: 'login', icon: 'log-in' },
    //{ title: 'logOut', url: 'login', icon: 'log-out' },
    //{ title: 'דו"ח שנתי', url: 'annual-report', icon: 'chatbubbles' },
    //{ title: 'דו"ח מע"מ', url: 'vat-report', icon: 'chatbubbles' },

  ];

  fromLoginPage = false; // Flag to check if entry was from login page
  isPopoverOpen: boolean = false;
  showMenu: boolean = false;
  columns: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[]; // Titles of expense // TODO: remove?
  userData: IUserDate;
  isUserAdmin: boolean = false; 
  constructor(private expenseDataServise: ExpenseDataService, private router: Router, private modalCtrl: ModalController, private authService: AuthService, private loadingController: LoadingController) { };

  ngOnInit() {

    this.getRoute();
    this.columns = this.expenseDataServise.getAddExpenseColumns() // TODO: remove?
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.getRoleUser();
    
    
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
      this.ngOnInit();
    }
  }

  getRoleUser(): void {
    if (this.userData.role === 'ADMIN') {
      this.isUserAdmin = true;
    }
    else {
      this.isUserAdmin = false
    }
    //return this.isUserAdmin;
  }

  openCloseLogOutPopup() {
    console.log("popover open");
    this.isPopoverOpen = !this.isPopoverOpen
    console.log(this.isPopoverOpen);
  }

  async openPopupAddExpense() {
    const modal = await this.modalCtrl.create({
      component: ModalExpensesComponent,
      componentProps: {
        columns: this.columns,
        data: {},
      },
      cssClass: 'expense-modal'
    })
    await modal.present();
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

}
