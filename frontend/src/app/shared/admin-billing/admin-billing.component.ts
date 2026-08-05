import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared.module';
import { BillingPlansComponent } from './plans/billing-plans.component';
import { BillingSubscriptionsComponent } from './subscriptions/billing-subscriptions.component';
import { PendingReceiptsComponent } from './pending-receipts/pending-receipts.component';

interface SubTab {
  label: string;
  value: string;
}

@Component({
  selector: 'app-admin-billing',
  standalone: true,
  templateUrl: './admin-billing.component.html',
  styleUrls: ['./admin-billing.component.scss'],
  imports: [CommonModule, SharedModule, BillingPlansComponent, BillingSubscriptionsComponent, PendingReceiptsComponent],
})
export class AdminBillingComponent {
  readonly subTabs: SubTab[] = [
    { label: 'תוכניות',      value: 'plans' },
    { label: 'מנויים',       value: 'subscriptions' },
    { label: 'קבלות חסרות',  value: 'pendingReceipts' },
  ];

  selectedSubTab = signal<string>('plans');

  onSubTabChange(value: string): void {
    this.selectedSubTab.set(value);
  }
}
