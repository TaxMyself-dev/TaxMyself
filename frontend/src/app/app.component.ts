import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IColumnDataTable, IRowDataTable } from './shared/interface';
import { Location } from '@angular/common';
import { AddInvoicePage } from './pages/add-expenses/add-expenses.page';
import { ModalController, PopoverController } from '@ionic/angular';
import { AuthService } from './services/auth.service';


@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss']
})
export class AppComponent {
  public appPages = [
    { title: 'דף-הבית', url: 'home', icon: 'home' },
    { title: 'איזור אישי', url: 'my-account', icon: 'person-circle' },
    { title: 'הענן שלי', url: 'my-storage', icon: 'cloud-download' },
    { title: ' הגשת דוחות', url: 'reports', icon: 'documents' },
    { title: 'הוספת חשבונית', url: 'add-expenses', icon: 'cloud-upload' },
    { title: 'יעוץ פיננסי', url: 'spam', icon: 'chatbubbles' },
    { title: 'הרשמה', url: 'register', icon: 'log-in' },
    { title: 'כניסה', url: 'login', icon: 'log-in' },
    { title: 'logOut', url: 'login', icon: 'log-out' },
    //{ title: 'דו"ח שנתי', url: 'annual-report', icon: 'chatbubbles' },
    //{ title: 'דו"ח מע"מ', url: 'vat-report', icon: 'chatbubbles' },

  ];
  isPopoverOpen: boolean = false;
  showMenu: boolean = false;
  //public labels = ['Family', 'Friends', 'Notes', 'Work', 'Travel', 'Reminders'];

  constructor(private router: Router, private modalCtrl: ModalController, private authService: AuthService, private popoverController: PopoverController) { };

  openCloseLogOutPopup() {
    console.log("popover open");
    this.isPopoverOpen = !this.isPopoverOpen
    console.log(this.isPopoverOpen);
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
