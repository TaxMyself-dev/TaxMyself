import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { UpdateDataComponent } from 'src/app/shared/update-data/update-data.component';


@Component({
  selector: 'my-status',
  templateUrl: './my-status.page.html',
  styleUrls: ['./my-status.page.scss'],
})
export class MyStatusPage {

  selectedTab: string = 'status-payments'; // Set default tab value

  tabs = [
    //{ label: 'סטטוס תשלומים', value: 'status-payments', component: StatusPaymentsComponent },
    { label: 'עדכון פרטים', value: 'update-details', component: UpdateDataComponent },
    //{ label: 'ניהול קטגוריות', value: 'manage-categories', component: ManageCategoriesComponent },
    //{ label: 'מעקב הוצאות', value: 'track-expenses', component: TrackExpensesComponent }
  ];
  
  // tabs = [
  //   { label: 'סטטוס תשלומים', value: 'status-payments', type: 'static', content: '<p>Status payments static content goes here.</p>' },
  //   { label: 'עדכון פרטים', value: 'update-details', type: 'component', component: UpdateDataComponent },
  //   { label: 'ניהול קטגוריות', value: 'manage-categories', type: 'static', content: '<p>Manage categories static content goes here.</p>' },
  //   { label: 'מעקב הוצאות', value: 'track-expenses', type: 'static', content: '<p>Track your expenses with this static content.</p>' }
  // ];

  blocksData = [
    {
      title: 'פרטים אישיים',
      fields: [
        { name: 'שם פרטי', value: 'אלי' },
        { name: 'שם משפחה', value: 'חיות' },
        { name: 'ת.ז.', value: '345789022' }
      ]
    },
    {
      title: 'פרטי העסק',
      fields: [
        { name: 'שם העסק', value: 'עסק מורשה' },
        { name: 'סוג העסק', value: 'עוסק מורשה' }
      ]
    }
  ]; 

  onTabChange(newTabValue: string) {
    this.selectedTab = newTabValue;
  }
  
  constructor() {
    console.log('Selected Tab on Load:', this.selectedTab);  // Debugging log
  }

  ngOnChanges() {
    console.log('Selected Tab Changed:', this.selectedTab);  // Debugging log
  }

  // vatReportForm: FormGroup;

  // constructor(private formBuilder: FormBuilder) {
  //   this.vatReportForm = this.formBuilder.group({
  //     vatableTurnover: new FormControl (
  //       '', Validators.required,
  //     ),
  //     nonVatableTurnover: new FormControl (
  //       '', Validators.required,
  //     ),
  //     year: new FormControl (
  //       '', Validators.required,
  //     ),
  //   })
  // }
}