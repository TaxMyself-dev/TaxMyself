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
    { title: 'איזור אישי', url: 'my-account', icon: 'person-circle' },
    { title: 'הענן שלי', url: 'my-storage', icon: 'cloud-download' },
    //{ title: 'דוח תזרים', url: 'flow-report', icon: 'cloud-download' },
    { title: ' הגשת דוחות', url: 'reports', icon: 'documents' },
    { title: 'הוספת חשבונית', url: 'add-expenses', icon: 'cloud-upload' },
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

  constructor(private expenseDataServise: ExpenseDataService, private router: Router, private modalCtrl: ModalController, private authService: AuthService, private loadingController: LoadingController) { };

  ngOnInit() {
    this.columns = this.expenseDataServise.getAddExpenseColumns() // TODO: remove?
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

  add(): void {
    // let filePath = '';

    // this.getLoader().pipe(
    //   finalize(() => {
    //     this.loadingController.dismiss();
    //   }),
    //   switchMap(() => this.getFileData()),
    //   catchError((err) => {
    //     alert('Something Went Wrong in first catchError: ' + err.message)
    //     return EMPTY;
    //   }),
    //   map((res) => {
    //     if (res) {
    //       filePath = res.metadata.fullPath;
    //     }
    //     const token = localStorage.getItem('token');
    //     return this.setFormData(filePath, token);
    //   }),
    //   switchMap((res) => this.expenseDataServise.addExpenseData(res)),
    //   finalize(() => {
    //     this.modalCtrl.dismiss();
    //   }),
    //   catchError((err) => {
    //     console.log(err);
    //     if (err.status == 401) {
    //       this. errorString = "משתמש לא חוקי , אנא התחבר למערכת";
    //       this.isOpen = true;
    //     }
    //     if (err.status == 0) {
    //       this.loadingController.dismiss();
    //       this. errorString = "אין אינטרנט, אנא ודא חיבור לרשת או נסה שנית מאוחר יותר";
    //       this.isOpen = true;
    //     }
    //     if (filePath !== '') {
    //       this.fileService.deleteFile(filePath);
    //     }
    //     return EMPTY;
    //   })
    // ).subscribe((res) => {
    //   this.router.navigate(['my-storage']);
    //   console.log('Saved expense data in DB. The response is: ', res);
    //   if (res) {
    //     this.expenseDataServise.updateTable$.next(true);
    //   }
    // });
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
