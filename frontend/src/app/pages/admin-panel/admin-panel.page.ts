import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';
import { ButtonSize as ComponentButtonSize, ButtonColor } from 'src/app/components/button/button.enum';
import { CategoryManagementComponent } from 'src/app/shared/category-management/category-management.component';
import { TransManagementComponent } from 'src/app/shared/trans-management/trans-management.component';
import { ClientsDashboardComponent } from 'src/app/shared/clients-dashboard/clients-dashboard.component';
import { AgentManagementComponent } from 'src/app/shared/agent-management/agent-management.component';
import { MessageService } from 'primeng/api';
import { IShaamApprovalResponse } from 'src/app/shared/interface';


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
  readonly componentButtonSize = ComponentButtonSize;
  readonly buttonColor = ButtonColor;
  readonly ButtonClass = ButtonClass;
  selectedFile: File = null;

  // SHAAM dialog state
  showShaamDialog = signal<boolean>(false);

  constructor(
    private formBuilder: FormBuilder, 
    private adminPanelService: AdminPanelService,
    private messageService: MessageService
  ) { }

  ngOnInit() {}

  onTabChange(newTabValue: string) {
    this.selectedTab = newTabValue;
  }

  onFileSelected(event: any): void {
    console.log("in file");
    this.selectedFile = event.target.files[0];
    console.log(this.selectedFile);
  }

  onOpenShaamDialog(): void {
    // Simply open the dialog - all Shaam logic is handled inside the dialog component
    this.showShaamDialog.set(true);
  }

  onShaamDialogClose(event: { visible: boolean }): void {
    this.showShaamDialog.set(event.visible);
  }

  onShaamApprovalSuccess(event: { response: IShaamApprovalResponse }): void {
    const response = event.response;
    
    if (response.confirmation_number) {
      this.messageService.add({
        severity: 'success',
        summary: 'הצלחה',
        detail: `מספר הקצאה התקבל: ${response.confirmation_number}`,
        life: 5000,
        key: 'br'
      });
    }
    
    // Optionally close dialog after success
    // this.showShaamDialog.set(false);
  }

}
