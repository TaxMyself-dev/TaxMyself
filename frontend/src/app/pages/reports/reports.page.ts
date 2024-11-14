import { Component, OnInit } from '@angular/core';
import { IItemNavigate } from 'src/app/shared/interface';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.page.html',
  styleUrls: ['./reports.page.scss'],
})
export class ReportsPage implements OnInit {
 
  itemsNavigate: IItemNavigate[] = [{ name: 'דו"ח מעמ', link: "/vat-report", icon: "document-outline", id: '0', index: 'zero'},
                                    { name:  'דו"ח רווח והפסד', link: "/pnl-report", icon: "document-outline", id: '1', index: 'one'}, 
                                    { name: 'דו"ח שנתי', link: "/annual-report", icon: "document-outline", id:'2', index: 'two'}, 
                                    { name: 'דו"ח מקדמות למס הכנסה', link: "/advance-income-tax-report", icon: "document-outline", id: '3', index: 'three'}];

  constructor() { }

  ngOnInit() {
  }

}
