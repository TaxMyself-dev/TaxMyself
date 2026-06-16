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
import { CardcomWebhookLog } from './entities/cardcom-webhook-log.entity';
import { BillingEvent } from './entities/billing-event.entity';

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
      CardcomWebhookLog,
      BillingEvent,
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
    PricingService,
    SubscriptionAccessService,
    AdminBillingService,
  ],
  exports: [BillingService, SubscriptionAccessService],
})
export class BillingModule {}
