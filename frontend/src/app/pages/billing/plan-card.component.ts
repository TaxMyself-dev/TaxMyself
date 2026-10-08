import { Component, Input, Output, EventEmitter } from '@angular/core';
export interface PricingCardPlan { id: number; name: string; badge: string | null; displayPrice: string; notes: string | null; features: { key: string; label: string; included: boolean }[]; recommended: boolean; }
@Component({standalone:true, selector:'app-plan-card', templateUrl:'./plan-card.component.html', styleUrl:'./billing-plans.page.scss'})
export class PlanCardComponent {
 @Input({required:true}) plan!: PricingCardPlan;
 @Input() buttonLabel='התחל עכשיו';
 @Input() disabled=false;
 @Input() busy=false;
 @Output() action=new EventEmitter<void>();
}
