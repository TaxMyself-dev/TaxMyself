import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { IItemNavigate, IUserData } from 'src/app/shared/interface';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.page.html',
  styleUrls: ['./reports.page.scss'],
})
export class ReportsPage implements OnInit {
 
  userData: IUserData;
  itemsNavigate: IItemNavigate[] 
  constructor(private authService: AuthService) { }

  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
   this.itemsNavigate = [
    { name: 'דו"ח מעמ', link: "/vat-report", icon: "document-outline", id: '0', index: 'zero', disable: this.userData.businessType === "EXEMPT" ? true : false},
    { name:  'דו"ח רווח והפסד', link: "/pnl-report", icon: "document-outline", id: '1', index: 'one'}, 
    { name: 'דו"ח שנתי', link: "/annual-report", icon: "document-outline", id:'2', index: 'two'}, 
    { name: 'דו"ח מקדמות למס הכנסה', link: "/advance-income-tax-report", icon: "document-outline", id: '3', index: 'three'},
    { name: 'מבנה קבצים אחיד', link: "/uniform-file", icon: "document-outline", id: '4', index: 'four'}
  ];

  }

}
