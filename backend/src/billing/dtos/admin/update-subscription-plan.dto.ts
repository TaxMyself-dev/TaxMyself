import { IsInt, IsOptional } from 'class-validator';

/**
 * Admin override of a subscription's plan, editable inline from the admin
 * subscriptions table. Only updates the FK — does not touch status/dates/
 * pricing, which are driven by the normal trial/checkout/renewal flows
 * (PricingService.calculateCheckoutPrice at actual charge time).
 */
export class UpdateSubscriptionPlanDto {
  /** FK -> subscription_plan.id. Pass null to clear (no plan selected). */
  @IsOptional()
  @IsInt()
  planId?: number | null;
}
