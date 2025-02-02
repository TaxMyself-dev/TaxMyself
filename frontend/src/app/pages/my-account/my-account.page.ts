import { Component, OnInit } from '@angular/core';
import { IItemNavigate } from 'src/app/shared/interface';

@Component({
  selector: 'app-my-account',
  templateUrl: './my-account.page.html',
  styleUrls: ['./my-account.page.scss'],
})
export class MyAccountPage implements OnInit {

  itemsNavigate: IItemNavigate[] = [{ name: "הפקת מסמך", link: "/doc-create", icon: "document-outline", id: '0', index: 'zero' }, 
                                    { name: "הוספת הוצאה", link: "/add-expenses", icon: "cloud-upload-outline", id: '1', index: 'one' }, 
                                    { name: "הענן שלי", link: "/my-storage", icon: "cloud-outline", id:'2', index: 'two'}, 
                                    { name: "תזרים", link: "/transactions", icon: "swap-vertical-outline", id: '3', index: 'three' }, 
                                    { name: "סטטוס", link: "/my-status", icon: "information-outline", id: '4', index: 'four', disable: true, }, 
                                    { name: "דוחות", link: "/reports", icon: "receipt-outline", id: '5', index: 'five' }];
  constructor() { }

    ngOnInit() {
      
    }

}
