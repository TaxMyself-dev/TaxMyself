import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { Subscription } from './entities/subscription.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { CardcomCheckoutSession } from './entities/cardcom-checkout-session.entity';
import { CardcomWebhookLog } from './entities/cardcom-webhook-log.entity';
import { BillingEvent } from './entities/billing-event.entity';
import { Promotion } from './entities/promotion.entity';
import { PromotionPlan } from './entities/promotion-plan.entity';
import { Coupon } from './entities/coupon.entity';
import { CouponPlan } from './entities/coupon-plan.entity';
import { CouponRedemption } from './entities/coupon-redemption.entity';
import { SubscriptionDiscount } from './entities/subscription-discount.entity';
import { SubscriptionCancellation } from './entities/subscription-cancellation.entity';
import { SubscriptionPlanChange } from './entities/subscription-plan-change.entity';

const BILLING_ENTITIES = [
  SubscriptionPlan,
  Subscription,
  PaymentMethod,
  CardcomCheckoutSession,
  CardcomWebhookLog,
  BillingEvent,
  Promotion,
  PromotionPlan,
  Coupon,
  CouponPlan,
  CouponRedemption,
  SubscriptionDiscount,
  SubscriptionCancellation,
  SubscriptionPlanChange,
];

@Module({
  imports: [TypeOrmModule.forFeature(BILLING_ENTITIES)],
  exports: [TypeOrmModule],
})
export class BillingModule {}
