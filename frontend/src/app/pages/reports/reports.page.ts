import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { IItemNavigate, IUserData } from 'src/app/shared/interface';

@Component({
    selector: 'app-reports',
    templateUrl: './reports.page.html',
    styleUrls: ['./reports.page.scss'],
    standalone: false
})
export class ReportsPage implements OnInit {
 
  userData: IUserData;
  itemsNavigate: IItemNavigate[] 
  constructor(private authService: AuthService) { }

  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
   this.itemsNavigate = [
    // { name: 'דו"ח מע"מ', link: "/vat-report", image: "../../../assets/vat_report.svg", id: '0', index: 'zero', disable: this.userData.businessType === "EXEMPT" ? true : false, content: 'דיווח ותשלום מע"מ'},
    { name: 'דו"ח מע"מ', link: "/vat-report", image: "../../../assets/vat_report.svg", id: '0', index: 'zero', content: 'דיווח ותשלום מע"מ'},
    { name:  'דו"ח רווח והפסד', link: "/pnl-report", image: "../../../assets/p&l_report.svg", id: '1', index: 'one', content: 'צפייה בהכנסות והוצאות העסק לפי תקופה'},
    { name: 'דו"ח מע"מ (יומן)', link: "/vat-report-journal", image: "../../../assets/vat_report.svg", id: '7', index: 'seven', content: 'דוח מע"מ מבוסס פקודות יומן — לצורך השוואה'},
    { name: 'דו"ח רווח והפסד (יומן)', link: "/pnl-report-journal", image: "../../../assets/p&l_report.svg", id: '8', index: 'eight', content: 'דוח רווח והפסד מבוסס פקודות יומן — לצורך השוואה'},
    // TODO: temporarily hidden during development - re-enable when annual report dev is complete
    // { name: 'דו"ח שנתי', link: "/annual-report", image: "../../../assets/annual_report.svg", id:'2', index: 'two', content: 'הגשת דו"ח שנתי למס הכנסה'},
    { name: 'דו"ח מקדמות למס הכנסה', link: "/advance-income-tax-report", image: "../../../assets/advance_report.svg", id: '3', index: 'three', content: 'דיווח ותשלום מקדמות למס הכנסה'},
    { name: 'מבנה קבצים אחיד', link: "/uniform-file", image: "../../../assets/uniform_structure.svg", id: '4', index: 'four', content: 'הפקת קובץ לפי דרישות רשות המיסים'},
    { name: 'דו"ח פחת (טופס 1342)', link: "/depreciation-report", image: "../../../assets/depreciation_report.svg", id: '5', index: 'five', content: 'הפקת דוח פחת על נכסי הציוד של העסק'},
    { name: 'כרטסת', link: "/ledger-report", image: "../../../assets/p&l_report.svg", id: '6', index: 'six', content: 'צפייה בתנועות יומן (כרטסת) לפי תקופה'}
  ];

  }

}
