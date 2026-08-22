import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';
import { ButtonSize as ComponentButtonSize, ButtonColor } from 'src/app/components/button/button.enum';
import { CategoryManagementComponent } from 'src/app/shared/category-management/category-management.component';
import { BookingAccountCatalogComponent } from 'src/app/shared/booking-account-catalog/booking-account-catalog.component';
import { TransManagementComponent } from 'src/app/shared/trans-management/trans-management.component';
import { ClientsDashboardComponent } from 'src/app/shared/clients-dashboard/clients-dashboard.component';
import { DemoDataComponent } from 'src/app/shared/demo-data/demo-data.component';
import { AdminBillingComponent } from 'src/app/shared/admin-billing/admin-billing.component';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { IShaamApprovalResponse } from 'src/app/shared/interface';
import { AdminDocumentationComponent } from './admin-documentation.component';
import { SharedModule } from '../../shared/shared.module';
import { ShaamInvoiceApprovalDialogComponent } from '../../components/shaam-invoice-approval-dialog/shaam-invoice-approval-dialog.component';
import { ButtonComponent } from '../../components/button/button.component';


@Component({
    selector: 'app-admin-panel',
    templateUrl: './admin-panel.page.html',
    styleUrls: ['./admin-panel.page.scss'],
    standalone: true,
    imports: [
      CommonModule,
      FormsModule,
      ReactiveFormsModule,
      IonicModule,
      SharedModule,
      DemoDataComponent,
      AdminBillingComponent,
      ShaamInvoiceApprovalDialogComponent,
      ButtonComponent,
      ToastModule,
      ConfirmDialogModule,
      AdminDocumentationComponent,
    ],
    providers: [ConfirmationService],
})
export class AdminPanelPage implements OnInit {

  tabs = [
    //{ label: 'סטטוס תשלומים', value: 'status-payments', component: StatusPaymentsComponent },
    { label: 'לוח בקרה - לקוחות', value: 'clients-dashboard', component: ClientsDashboardComponent },
    { label: 'ניהול קטגוריות', value: 'category-management', component: CategoryManagementComponent },
    { label: 'כרטיסי טופס 6111', value: 'booking-account-catalog', component: BookingAccountCatalogComponent },
    { label: 'ניהול תנועות', value: 'trans-management', component: TransManagementComponent },
    { label: 'נתוני דמו', value: 'demo-data', component: DemoDataComponent },
    { label: 'קארדקום / מנויים', value: 'billing', component: AdminBillingComponent },
    { label: 'דוקומנטציה', value: 'documentation', component: AdminDocumentationComponent },
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
