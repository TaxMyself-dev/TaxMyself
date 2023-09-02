import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TableService } from './services/table.service';
import { IColumnDataTable, IRowDataTable } from './shared/interface';
import { Location } from '@angular/common';
import { AddInvoicePage } from './pages/add-expenses/add-expenses.page';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss']
})
export class AppComponent  {
  public appPages = [
    { title: 'דף-הבית', url: 'home', icon: 'home' },
    { title: 'איזור אישי', url: 'my-account', icon: 'person-circle' },
    { title: 'הענן שלי', url: 'my-storage', icon: 'cloud-download'},
    { title: ' הגשת דוחות', url: 'reports', icon: 'documents' },
    { title: 'הוספת חשבונית', url: 'add-expenses', icon: 'cloud-upload' },
    { title: 'יעוץ פיננסי', url: 'spam', icon: 'chatbubbles' },
    { title: 'הרשמה', url: 'register', icon: 'chatbubbles' },
    { title: 'כניסה', url: 'login', icon: 'chatbubbles' },
    //{ title: 'דו"ח שנתי', url: 'annual-report', icon: 'chatbubbles' },
    //{ title: 'דו"ח מע"מ', url: 'vat-report', icon: 'chatbubbles' },

  ];
  //public labels = ['Family', 'Friends', 'Notes', 'Work', 'Travel', 'Reminders'];

  constructor() {
    
  }
 
}
