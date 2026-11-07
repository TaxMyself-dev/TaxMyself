import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';
import { CategoryManagementComponent } from 'src/app/shared/category-management/category-management.component';
import { BookingAccountCatalogComponent } from 'src/app/shared/booking-account-catalog/booking-account-catalog.component';
import { TransManagementComponent } from 'src/app/shared/trans-management/trans-management.component';
import { ClientsDashboardComponent } from 'src/app/shared/clients-dashboard/clients-dashboard.component';
import { DemoDataComponent } from 'src/app/shared/demo-data/demo-data.component';
import { AdminBillingComponent } from 'src/app/shared/admin-billing/admin-billing.component';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { AdminDocumentationComponent } from './admin-documentation.component';
import { SharedModule } from '../../shared/shared.module';
import { AdminTaxFileComponent } from './admin-tax-file.component';
import { AdminContentComponent } from './admin-content.component';
import { AdminShaamAllocationsComponent } from './admin-shaam-allocations.component';
import {
  DEV_AGENT_FROM_ADMIN,
  DEV_AGENT_PATH,
  devAgentApiOverride,
  devAgentRouteEnabled,
} from '../dev-agent/dev-agent.route';

// The tab that opens the AI agent's dev chat (its own route, not a panel).
export const AI_CHAT_TAB = 'ai-chat';

// Shown only while the chat's route exists (local development).
export const aiChatTabs = (routeEnabled: boolean) =>
  routeEnabled ? [{ label: 'צ׳אט AI', value: AI_CHAT_TAB }] : [];


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
      ToastModule,
      ConfirmDialogModule,
      AdminDocumentationComponent,
      AdminContentComponent,
      AdminTaxFileComponent,
      AdminShaamAllocationsComponent,
    ],
    providers: [ConfirmationService],
})
export class AdminPanelPage implements OnInit {

  tabs = [
    { label: 'הקצאות שע״מ', value: 'shaam-allocations', component: AdminShaamAllocationsComponent },
    //{ label: 'סטטוס תשלומים', value: 'status-payments', component: StatusPaymentsComponent },
    { label: 'לוח בקרה - לקוחות', value: 'clients-dashboard', component: ClientsDashboardComponent },
    { label: 'תיק המס שלי', value: 'tax-file', component: AdminTaxFileComponent },
    { label: 'קטגוריות וכרטיסים', value: 'catalog-management', component: CategoryManagementComponent },
    { label: 'ניהול תנועות', value: 'trans-management', component: TransManagementComponent },
    { label: 'נתוני דמו', value: 'demo-data', component: DemoDataComponent },
    { label: 'קארדקום / מנויים', value: 'billing', component: AdminBillingComponent },
    { label: 'תוכן', value: 'content', component: AdminContentComponent },
    { label: 'דוקומנטציה', value: 'documentation', component: AdminDocumentationComponent },
    ...aiChatTabs(devAgentRouteEnabled()),
  ];

  selectedTab: string = 'clients-dashboard'; // Set default tab value

  catalogTabs = [
    { label: 'קטגוריות', value: 'categories', component: CategoryManagementComponent },
    { label: 'כרטיסים', value: 'cards', component: BookingAccountCatalogComponent },
  ];

  selectedCatalogTab: 'categories' | 'cards' = 'categories';

  readonly buttonSize = ButtonSize;
  readonly ButtonClass = ButtonClass;
  selectedFile: File = null;

  constructor(
    private formBuilder: FormBuilder, 
    private adminPanelService: AdminPanelService,
    private router: Router,
    private route: ActivatedRoute,
  ) { }

  ngOnInit() {}

  onTabChange(newTabValue: string) {
    if (newTabValue === AI_CHAT_TAB) {
      this.openAiChat();
      return;
    }
    this.selectedTab = newTabValue;
  }

  // Opens the existing chat page (its AuthGuard and Firebase token apply),
  // passing on a local ?api= backend override and a way back here.
  private openAiChat(): void {
    const previousTab = this.selectedTab;
    // Let the segment show the choice, then restore it: the chat is another
    // page, and the panel must not stay on an empty tab.
    this.selectedTab = AI_CHAT_TAB;
    const api = devAgentApiOverride(this.route.snapshot.queryParamMap.get('api'));
    void this.router
      .navigate(['/' + DEV_AGENT_PATH], {
        queryParams: { from: DEV_AGENT_FROM_ADMIN, ...(api ? { api } : {}) },
      })
      .finally(() => (this.selectedTab = previousTab));
  }

  onCatalogTabChange(newTabValue: string): void {
    this.selectedCatalogTab = newTabValue === 'cards' ? 'cards' : 'categories';
  }

  onFileSelected(event: any): void {
    console.log("in file");
    this.selectedFile = event.target.files[0];
    console.log(this.selectedFile);
  }

}
