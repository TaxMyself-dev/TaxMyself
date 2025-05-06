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
    { name: 'דו"ח מעמ', link: "/vat-report", image: "../../../assets/vat_report.svg", id: '0', index: 'zero', disable: this.userData.businessType === "EXEMPT" ? true : false, content: 'דוח מע"מ מסכם כמה מע"מ גבית וכמה שילמת, כדי לחשב אם אתה משלם או מקבל החזר מהמדינה'},
    { name:  'דו"ח רווח והפסד', link: "/pnl-report", image: "../../../assets/p&l_report.svg", id: '1', index: 'one', content: "דוח רווח והפסד מציג את ההכנסות וההוצאות של העסק בתקופה מסוימת, כדי לראות אם הרווחת או הפסדת"}, 
    { name: 'דו"ח שנתי', link: "/annual-report", image: "../../../assets/annual_report.svg", id:'2', index: 'two', content: 'דוח שנתי הוא דו"ח שמגישים לרשות המסים פעם בשנה, ובו מפורטים כל ההכנסות, ההוצאות והמיסים של העסק או העצמאי. מטרתו לקבוע את גובה המס לתשלום או להחזר'}, 
    { name: 'דו"ח מקדמות למס הכנסה', link: "/advance-income-tax-report", image: "../../../assets/advance_report.svg", id: '3', index: 'three', content: 'דוח מקדמות למס הכנסה מפרט את התשלומים ששילמת במהלך השנה על חשבון מס ההכנסה הסופי שלך. זה בעצם תשלום מקדים כדי שלא תיתפס עם חוב גדול בסוף השנה'},
    { name: 'מבנה קבצים אחיד', link: "/uniform-file", image: "../../../assets/uniform_structure.svg", id: '4', index: 'four', content: 'מבנה קבצים אחיד הוא תקן שמגדיר איך עסקים צריכים לשלוח דוחות כספיים ודיווחים לרשויות בצורה מסודרת ואחידה. המטרה היא לוודא שכל הנתונים בפורמט ברור ומקובל, בלי בלגן'}
  ];

  }

}
