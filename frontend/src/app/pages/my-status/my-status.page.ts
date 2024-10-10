import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { UpdateDataComponent } from 'src/app/shared/update-data/update-data.component';
import { MyStatusService } from './my-status.page.service';


@Component({
  selector: 'my-status',
  templateUrl: './my-status.page.html',
  styleUrls: ['./my-status.page.scss'],
})
export class MyStatusPage {

  selectedTab: string = 'status-payments'; // Set default tab value
  userData: any = null;

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
    console.log('Selected tab on tab change:', this.selectedTab);
    if (this.selectedTab === 'update-details') {
      this.fetchUpdateDetailsData();
    }
  }

  
  constructor(private myStatusService: MyStatusService) {
    console.log('Selected Tab on Load:', this.selectedTab);  // Debugging log
  }


  ngOnInit() {
    // Optionally fetch initial data
    console.log('Selected tab on init:', this.selectedTab);

    if (this.selectedTab === 'update-details') {
      this.fetchUpdateDetailsData();
    }
  }


  fetchUpdateDetailsData() {
    this.myStatusService.getUserDetails().subscribe(
      (data) => {
        console.log("User data fetched: ", data);  // Log the actual data
        this.userData = data;  // Store user data
        //this.processUserData(this.userData);  // Process the data to fit blocksData
      },
      (error) => {
        console.error("Error fetching user data: ", error);  // Handle error
      }
    );
  }


  // fetchUpdateDetailsData() {
  //   this.myStatusService.getUserDetails().subscribe((data) => {
  //     this.userData = data;  // Store the data fetched from the backend
  //   });
  //   console.log("user data is ", this.userData);
  // }

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