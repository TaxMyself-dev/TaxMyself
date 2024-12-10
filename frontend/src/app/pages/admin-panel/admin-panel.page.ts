import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { catchError, EMPTY } from 'rxjs';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';
import { CategoryManagementComponent } from 'src/app/shared/category-management/category-management.component';


@Component({
  selector: 'app-admin-panel',
  templateUrl: './admin-panel.page.html',
  styleUrls: ['./admin-panel.page.scss'],
})
export class AdminPanelPage implements OnInit {

  tabs = [
    //{ label: 'סטטוס תשלומים', value: 'status-payments', component: StatusPaymentsComponent },
    { label: 'ניהול קטגוריות', value: 'category-management', component: CategoryManagementComponent },
  ];

  selectedTab: string = 'category-management'; // Set default tab value
  fisiteDataForm: FormGroup;


  readonly buttonSize = ButtonSize;
  readonly ButtonClass = ButtonClass;
  selectedFile: File = null;


  constructor(private formBuilder: FormBuilder, private adminPanelService: AdminPanelService) { }

  ngOnInit() {
   this.fisiteDataForm = this.formBuilder.group({
    startDate: new FormControl(
      Date, Validators.required,
    ),
    endDate: new FormControl(
      Date, Validators.required,
    ),
    finsiteId: new FormControl(
      '', Validators.required,
    ),
   })
  }

  onTabChange(newTabValue: string) {
    this.selectedTab = newTabValue;
  }

  onFileSelected(event: any): void {
    console.log("in file");
    this.selectedFile = event.target.files[0];
    console.log(this.selectedFile);
  }

  getTransFromApi(): void {
    const formData = this.fisiteDataForm.value;
    console.log(formData);
    this.adminPanelService.getTransFromApi(formData)
    .pipe(
      catchError((error) => {
        console.log("error in get trans from api: ", error);
        return EMPTY;
      })
    )
    .subscribe((res) => {
      console.log("res of get trans from api: ", res);
    })
  }

  // onUpload(): void {
  //   if (this.selectedFile) {
  //     this.expenseDataService.getLoader().subscribe()
  //     const reader = new FileReader();

  //     reader.onload = (e) => {
  //       const arrayBuffer = reader.result;
  //       console.log("array buffer: ", arrayBuffer);

  //       this.transactionService.uploadFile(arrayBuffer as ArrayBuffer)
  //         .pipe(
  //           finalize(() => this.expenseDataService.dismissLoader()),
  //           takeUntil(this.destroy$))
  //         .subscribe(
  //           (response) => {
  //             this.messageToast = `הקובץ ${this.selectedFile.name} הועלה בהצלחה`;
  //             this.isToastOpen = true;
  //             console.log(response.message);
  //             // Handle successful response
  //           },
  //           error => {
  //             console.error('Error uploading file', error);
  //             // Handle error response
  //             alert("העלאת קובץ נכשלה. אנא בחר קובץ תקין או נסה מאוחר יותר")
  //           }
  //           );
  //     };

  //     reader.readAsArrayBuffer(this.selectedFile);
  //   } else {
  //     console.error('No file selected.');
  //     alert("אנא בחר קובץ")
  //   }
  // }

}
