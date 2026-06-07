import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared.module';
import { BillingPlansComponent } from './plans/billing-plans.component';
import { BillingPromotionsComponent } from './promotions/billing-promotions.component';
import { BillingCouponsComponent } from './coupons/billing-coupons.component';
import { BillingSubscriptionsComponent } from './subscriptions/billing-subscriptions.component';

interface SubTab {
  label: string;
  value: string;
}

@Component({
  selector: 'app-admin-billing',
  standalone: true,
  templateUrl: './admin-billing.component.html',
  styleUrls: ['./admin-billing.component.scss'],
  imports: [CommonModule, SharedModule, BillingPlansComponent, BillingPromotionsComponent, BillingCouponsComponent, BillingSubscriptionsComponent],
})
export class AdminBillingComponent {
  readonly subTabs: SubTab[] = [
    { label: 'תוכניות',  value: 'plans' },
    { label: 'מבצעים',  value: 'promotions' },
    { label: 'קופונים',  value: 'coupons' },
    { label: 'מנויים',   value: 'subscriptions' },
    // Future phases: user-discounts, logs
  ];

  selectedSubTab = signal<string>('plans');

  onSubTabChange(value: string): void {
    this.selectedSubTab.set(value);
  }
}
