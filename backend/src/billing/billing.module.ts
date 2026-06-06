import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';

// External entities needed for FirebaseAuthGuard dependencies
import { User } from 'src/users/user.entity';
import { Delegation } from 'src/delegation/delegation.entity';

// Billing entities
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

// Guards
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';

// Controllers
import { BillingController } from './billing.controller';
import { CardcomWebhookController } from './cardcom-webhook.controller';
import { AdminBillingController } from './admin-billing.controller';

// Services
import { BillingService } from './services/billing.service';
import { BillingEventService } from './services/billing-event.service';
import { CardcomService } from './services/cardcom.service';
import { CardcomWebhookService } from './services/cardcom-webhook.service';
import { CouponService } from './services/coupon.service';
import { PromotionService } from './services/promotion.service';
import { PricingService } from './services/pricing.service';
import { SubscriptionAccessService } from './services/subscription-access.service';
import { AdminBillingService } from './services/admin-billing.service';

// Modules
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    // 30-second timeout matches CardcomService; longer for slow Israeli payment gateway.
    HttpModule.register({ timeout: 30_000, maxRedirects: 3 }),
    UsersModule,
    TypeOrmModule.forFeature([
      // Billing entities
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
      // External entities required by FirebaseAuthGuard
      User,
      Delegation,
    ]),
  ],
  controllers: [BillingController, CardcomWebhookController, AdminBillingController],
  providers: [
    FirebaseAuthGuard,
    BillingService,
    BillingEventService,
    CardcomService,
    CardcomWebhookService,
    CouponService,
    PromotionService,
    PricingService,
    SubscriptionAccessService,
    AdminBillingService,
  ],
  exports: [BillingService, SubscriptionAccessService],
})
export class BillingModule {}
