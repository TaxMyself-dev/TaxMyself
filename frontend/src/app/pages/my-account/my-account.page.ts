import { Component, OnInit } from '@angular/core';
import { IItemNavigate } from 'src/app/shared/interface';

@Component({
    selector: 'app-my-account',
    templateUrl: './my-account.page.html',
    styleUrls: ['./my-account.page.scss'],
    standalone: false
})
export class MyAccountPage implements OnInit {

  itemsNavigate: IItemNavigate[] = [//{ name: "הפקת מסמך", link: "/doc-create", icon: "document-outline", id: '0', index: 'zero' }, 
                                    { name: "הוספת הוצאה", link: "/add-expenses", image: "cloud-upload-outline", id: '1', index: 'one' }, 
                                    { name: "הענן שלי", link: "/my-storage", image: "cloud-outline", id:'2', index: 'two'}, 
                                    { name: "תזרים", link: "/transactions", image: "swap-vertical-outline", id: '3', index: 'three' }, 
                                    { name: "סטטוס", link: "/my-status", image: "information-outline", id: '4', index: 'four', disable: true, }, 
                                    { name: "דוחות", link: "/reports", image: "receipt-outline", id: '5', index: 'five' },
                                    { name: "יצירת מסמך", link: "/doc-create", image: "receipt-outline", id: '6', index: 'six' },
                                  ];
  constructor() { }

    ngOnInit() {
      
    }

}
