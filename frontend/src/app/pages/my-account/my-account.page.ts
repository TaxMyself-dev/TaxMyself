import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { IItemNavigate } from 'src/app/shared/interface';

@Component({
  selector: 'app-my-account',
  templateUrl: './my-account.page.html',
  styleUrls: ['./my-account.page.scss'],
})
export class MyAccountPage implements OnInit {

  itemsNavigate: IItemNavigate[] = [{ name: "הפקת מסמך", link: "", icon: "document-outline", id: '0' }, { name: "הוספת הוצאה", link: "/add-expenses", icon: "cloud-upload-outline", id: '1' }, { name: "הענן שלי", link: "/my-storage", icon: "cloud-outline", id:'2'}, { name: "תזרים", link: "", icon: "swap-vertical-outline", id: '3' }, { name: "סטטוס", link: "", icon: "information-outline", id: '4' }, { name: "דוחות", link: "/reports", icon: "receipt-outline", id: '5' }];

  constructor(private http: HttpClient, private authService: AuthService) { }

    ngOnInit() {
      
    }

}
