import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { UpdateDataComponent } from 'src/app/shared/update-data/update-data.component';
import { MyStatusService } from './my-status.page.service';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';
import { employmentTypeOptionsList, familyStatusOptionsList, businessTypeOptionsList } from 'src/app/shared/enums';
import { FormTypes } from 'src/app/shared/enums';



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

  
  constructor(private myStatusService: MyStatusService,
              private dateService: DateService,
              private authService: AuthService) {
    console.log('Selected Tab on Load:', this.selectedTab);  // Debugging log
  }


  ngOnInit() {
    // Optionally fetch initial data
    console.log('Selected tab on init:', this.selectedTab);
    console.log('updateUser function:', this.updateUser);


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
    console.log("timestamp spouse is", getUserData.spouseDateOfBirth);
    console.log("date spouse is", this.dateService.convertTimestampToDateInput(getUserData.businessDate));
    

    this.userData = [
      {
        title: 'פרטים אישיים',
        fields: [
          { name: 'שם פרטי', value: getUserData.fName, type: 'input' },
          { name: 'שם משפחה', value: getUserData.lName, type: 'input' },
          { name: 'ת.ז', value: getUserData.id, type: 'input' },
          { name: 'תאריך לידה', value: this.dateService.convertTimestampToDateInput(getUserData.dateOfBirth), type: 'input' },
        ]
      },
      {
        title: 'פרטי בן/בת הזוג',
        enabled: getUserData.familyStatus !== "single",
        fields: [
          { name: 'שם פרטי', value: getUserData.spouseFName, type: 'input' },
          { name: 'שם משפחה', value: getUserData.spouseLName, type: 'input' },
          { name: 'ת.ז.', value: getUserData.spouseId, type: 'input' },
          { name: 'תאריך לידה', value: this.dateService.convertTimestampToDateInput(getUserData.spouseDateOfBirth), type: 'input' },
        ]
      },
      {
        title: 'פרטי העסק',
        fields: [
          { name: 'שם העסק', value: getUserData.businessName, type: 'input' },
          { name: 'סוג העסק', value: getUserData.businessType, type: 'select', options: businessTypeOptionsList},
          { name: 'מספר עוסק', value: getUserData.businessId, type: 'input' },
          { name: 'תאריך פתיחת העסק', value: this.dateService.convertTimestampToDateInput(getUserData.businessDate), type: 'input' },
        ]
      }
    ];

   

    // this.userData = [
    //   {
    //     title: 'פרטים אישיים',
    //     fields: [
    //       { name: 'שם פרטי', value: getUserData.fName, type: FormTypes.TEXT },
    //       { name: 'שם משפחה', value: getUserData.lName, type: FormTypes.TEXT },
    //       { name: 'ת.ז', value: getUserData.id },
    //       { name: 'תאריך לידה', value: getUserData.dateOfBirth },
    //       { name: 'מספר פלאפון', value: getUserData.phone },
    //       { name: 'אימייל', value: getUserData.email },
    //       { name: 'כתובת', value: getUserData.city },
    //       //{ name: 'סטטוס משפחתי', value: getUserData.familyStatus },
    //       { name: 'סטטוס משפחתי', value: getUserData.familyStatus, type: 'select', options: familyStatusOptionsList, controlName: 'AAA' },
    //       { name: 'סטטוס תעסוקתי', value: getUserData.employmentType, type: 'select', options: employmentTypeOptionsList, controlName: 'employmentType' }
    //     ]
    //   },
    //   {
    //     title: 'פרטי בן/בת הזוג',
    //     enabled: getUserData.familyStatus !== "רווק",
    //     fields: [
    //       { name: 'שם פרטי', value: getUserData.spouseFName },
    //       { name: 'שם משפחה', value: getUserData.spouseLName },
    //       { name: 'ת.ז.', value: getUserData.spouseId },
    //       { name: 'תאריך לידה', value: getUserData.spouseDateOfBirth },
    //     ]
    //   },
    //   {
    //     title: 'פרטי העסק',
    //     fields: [
    //       { name: 'שם העסק', value: getUserData.businessName },
    //       { name: 'סוג העסק', value: getUserData.businessType },
    //       { name: 'מספר עוסק', value: getUserData.businessId },
    //       { name: 'תאריך פתיחת העסק', value: getUserData.businessDate },
    //       { name: 'סוג דיווח למע"מ', value: getUserData.vatReportingType },
    //       { name: 'סוג דיווח מקדמות מס הכנסה', value: getUserData.taxReportingType },
    //     ]
    //   },
    //   {
    //     title: 'חשבונות',
    //     fields: [
    //       { name: 'חשבונות', value: getUserData.bills },
    //     ]
    //   }
    // ];

    console.log("Mapped userData: ", this.userData);

  }


  // Define the user update function
  updateUser(data: any) {
    console.log("updateUser data is ", data);
    
    this.authService.updateUser(data).subscribe({
      next: (response) => console.log('User updated successfully:', response),
      error: (error) => console.error('Error updating user:', error),
      complete: () => console.log('Update process completed.')
    });
  }


}