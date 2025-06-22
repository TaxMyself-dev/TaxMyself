import { Component, OnInit } from '@angular/core';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { AuthService } from 'src/app/services/auth.service';
import { IItemNavigate, IUserData } from 'src/app/shared/interface';

@Component({
    selector: 'app-my-account',
    templateUrl: './my-account.page.html',
    styleUrls: ['./my-account.page.scss'],
    standalone: false
})
export class MyAccountPage implements OnInit {

  userData: IUserData;

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  

  itemsNavigate: IItemNavigate[] = [
    { name: "הפקת מסמך", link: "/doc-create", image: "../../../assets/icon-doc-create.svg", content: 'מפיקים מסמך בקלי קלות', id: '0', index: 'zero' },
    { name: "המסמכים שלי", link: "/my-storage", image: "../../../assets/icon-my-docs.svg", content: 'כל הקבצים במקום אחד', id:'1', index: 'one'}, 
    // { name: "הוספת הוצאה", link: "/add-expenses", image: "cloud-upload-outline", id: '1', index: 'one' }, 
    { name: "התזרים שלי", link: "/transactions", image: "../../../assets/icon-my-trans.svg", content: 'צפייה וסיווג תנועות בחשבון', id: '2', index: 'two' }, 
    { name: "דוחות", link: "/reports", image: "../../../assets/icon-report-create.svg", content: 'דוחות לרשויות בקליק', id: '3', index: 'three' },
  ];

  constructor(private authService: AuthService) { }

  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();    
  }

}
