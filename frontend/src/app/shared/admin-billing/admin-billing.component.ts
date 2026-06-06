import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared.module';
import { BillingPlansComponent } from './plans/billing-plans.component';
import { BillingPromotionsComponent } from './promotions/billing-promotions.component';

interface SubTab {
  label: string;
  value: string;
}

@Component({
  selector: 'app-admin-billing',
  standalone: true,
  templateUrl: './admin-billing.component.html',
  styleUrls: ['./admin-billing.component.scss'],
  imports: [CommonModule, SharedModule, BillingPlansComponent, BillingPromotionsComponent],
})
export class AdminBillingComponent {
  readonly subTabs: SubTab[] = [
    { label: 'תוכניות',  value: 'plans' },
    { label: 'מבצעים',  value: 'promotions' },
    // Future phases: coupons, user-discounts, users, logs
  ];

  selectedSubTab = signal<string>('plans');

  onSubTabChange(value: string): void {
    this.selectedSubTab.set(value);
  }
}
