import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { catchError, EMPTY } from 'rxjs';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';
import { CategoryManagementComponent } from 'src/app/shared/category-management/category-management.component';
import { TransManagementComponent } from 'src/app/shared/trans-management/trans-management.component';


@Component({
  selector: 'app-admin-panel',
  templateUrl: './admin-panel.page.html',
  styleUrls: ['./admin-panel.page.scss'],
})
export class AdminPanelPage implements OnInit {

  tabs = [
    //{ label: 'סטטוס תשלומים', value: 'status-payments', component: StatusPaymentsComponent },
    { label: 'ניהול קטגוריות', value: 'category-management', component: CategoryManagementComponent },
    { label: 'ניהול תנועות', value: 'trans-management', component: TransManagementComponent },
  ];

  selectedTab: string = 'category-management'; // Set default tab value

  readonly buttonSize = ButtonSize;
  readonly ButtonClass = ButtonClass;
  selectedFile: File = null;


  constructor(private formBuilder: FormBuilder, private adminPanelService: AdminPanelService) { }

  ngOnInit() {}

  onTabChange(newTabValue: string) {
    this.selectedTab = newTabValue;
  }

  onFileSelected(event: any): void {
    console.log("in file");
    this.selectedFile = event.target.files[0];
    console.log(this.selectedFile);
  }

}
