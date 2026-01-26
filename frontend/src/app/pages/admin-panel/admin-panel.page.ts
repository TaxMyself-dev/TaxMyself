import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { catchError, EMPTY } from 'rxjs';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';
import { CategoryManagementComponent } from 'src/app/shared/category-management/category-management.component';
import { TransManagementComponent } from 'src/app/shared/trans-management/trans-management.component';
import { ClientsDashboardComponent } from 'src/app/shared/clients-dashboard/clients-dashboard.component';
import { AgentManagementComponent } from 'src/app/shared/agent-management/agent-management.component';


@Component({
    selector: 'app-admin-panel',
    templateUrl: './admin-panel.page.html',
    styleUrls: ['./admin-panel.page.scss'],
    standalone: false
})
export class AdminPanelPage implements OnInit {

  tabs = [
    //{ label: 'סטטוס תשלומים', value: 'status-payments', component: StatusPaymentsComponent },
    { label: 'לוח בקרה - לקוחות', value: 'clients-dashboard', component: ClientsDashboardComponent },
    { label: 'ניהול קטגוריות', value: 'category-management', component: CategoryManagementComponent },
    { label: 'ניהול תנועות', value: 'trans-management', component: TransManagementComponent },
    { label: 'ניהול סוכנים', value: 'agent-management', component: AgentManagementComponent },
  ];

  selectedTab: string = 'clients-dashboard'; // Set default tab value

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
