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
        this.processUserData(this.userData);  // Process the data to fit blocksData
      },
      (error) => {
        console.error("Error fetching user data: ", error);  // Handle error
      }
    );
  }


  processUserData(data: any) {

    console.log("processUserData: user data is ", data);

    const getUserData = data[0];
    
    this.userData = [
      {
        title: 'פרטים אישיים',  // Personal details block
        fields: [
          { name: 'שם פרטי', value: getUserData.fName },   // First name field
          { name: 'שם משפחה', value: getUserData.lName },   // Last name field
          { name: 'ת.ז.', value: getUserData.id }        // ID number field
        ]
      },
      {
        title: 'פרטי העסק',  // Business details block
        fields: [
          { name: 'שם העסק', value: getUserData.businessName }, // Business name field
          { name: 'סוג העסק', value: getUserData.businessType }  // Business type field
        ]
      }
    ];

    console.log("Mapped userData: ", this.userData);

  }


}