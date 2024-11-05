import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IColumnDataTable, IRowDataTable } from './shared/interface';
import { Location } from '@angular/common';
import { LoadingController, ModalController, PopoverController } from '@ionic/angular';
import { AuthService } from './services/auth.service';
import { ExpenseDataService } from './services/expense-data.service';
import { ModalExpensesComponent } from './shared/modal-add-expenses/modal.component';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from './shared/enums';
import { catchError, EMPTY, finalize, from, map, Observable, switchMap } from 'rxjs';


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
  isPopoverOpen: boolean = false;
  showMenu: boolean = false;
  columns: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[]; // Titles of expense // TODO: remove?
  userData: any;
  constructor(private expenseDataServise: ExpenseDataService, private router: Router, private modalCtrl: ModalController, private authService: AuthService, private loadingController: LoadingController) { };

  ngOnInit() {
    this.columns = this.expenseDataServise.getAddExpenseColumns() // TODO: remove?
    this.userData = this.authService.getUserDataFromLocalStorage();
    console.log("this.userData.role: ", this.userData.role);
    console.log("this.userData: ", this.userData);
    
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

  getLoader(): Observable<any> {
    return from(this.loadingController.create({
      message: 'Please wait...',
      spinner: 'crescent'
    }))
    .pipe(
        catchError((err) => {
          console.log("err in create loader in save supplier", err);
          return EMPTY;
        }),
        switchMap((loader) => {
          if (loader) {
            return from(loader.present())
          }
            console.log("loader in save supplier is null");
            return EMPTY;
        }),
        catchError((err) => {
          console.log("err in open loader in save supplier", err);
          return EMPTY;
        })
      )
  }



}
