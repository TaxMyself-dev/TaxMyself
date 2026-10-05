import { forwardRef, Module } from '@nestjs/common';
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
import { BillingObligation } from './entities/billing-obligation.entity';
import { BillingAttempt } from './entities/billing-attempt.entity';
import { BillingAttemptObligation } from './entities/billing-attempt-obligation.entity';
import { PaymentMethodUpdateAttempt } from './entities/payment-method-update-attempt.entity';

// Guards
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { SubscriptionGuard } from 'src/guards/subscription.guard';

// Controllers
import { BillingController } from './billing.controller';
import { CardcomWebhookController } from './cardcom-webhook.controller';
import { AdminBillingController } from './admin-billing.controller';

// Services
import { BillingService } from './services/billing.service';
import { BillingDebtService } from './services/billing-debt.service';
import { BillingEventService } from './services/billing-event.service';
import { BillingReceiptService } from './services/billing-receipt.service';
import { BillingIssuerConfigService } from './services/billing-issuer-config.service';
import { CardcomService } from './services/cardcom.service';
import { CardcomWebhookService } from './services/cardcom-webhook.service';
import { PricingService } from './services/pricing.service';
import { SubscriptionAccessService } from './services/subscription-access.service';
import { AdminBillingService } from './services/admin-billing.service';
import { SubscriptionRenewalService } from './services/subscription-renewal.service';
import { BillingAttemptOrchestrationService } from './services/billing-attempt-orchestration.service';
import { BillingLifecycleService } from './services/billing-lifecycle.service';
import { BillingHostedCompletionService } from './services/billing-hosted-completion.service';
import { BillingReconciliationService } from './services/billing-reconciliation.service';
import {
  BILLING_CARD_COM_EXECUTOR,
  BillingProviderRuntimeService,
} from './services/billing-provider-runtime.service';
import { BillingCardcomExecutorService } from './services/billing-cardcom-executor.service';

// Modules
import { UsersModule } from 'src/users/users.module';
import { DocumentsModule } from 'src/documents/documents.module';
import { MailModule } from 'src/mail/mail.module';
import { BusinessModule } from 'src/business/business.module';

@Module({
  imports: [
    // 30-second timeout matches CardcomService; longer for slow Israeli payment gateway.
    HttpModule.register({ timeout: 30_000, maxRedirects: 3 }),
    forwardRef(() => UsersModule),
    DocumentsModule,
    MailModule,
    BusinessModule,
    TypeOrmModule.forFeature([
      // Billing entities
      SubscriptionPlan,
      Subscription,
      PaymentMethod,
      CardcomWebhookLog,
      BillingEvent,
      BillingObligation,
      BillingAttempt,
      BillingAttemptObligation,
      PaymentMethodUpdateAttempt,
      // External entities required by FirebaseAuthGuard
      User,
      Delegation,
    ]),
  ],
  controllers: [
    BillingController,
    CardcomWebhookController,
    AdminBillingController,
  ],
  providers: [
    FirebaseAuthGuard,
    BillingService,
    BillingDebtService,
    BillingEventService,
    BillingReceiptService,
    BillingIssuerConfigService,
    CardcomService,
    CardcomWebhookService,
    PricingService,
    SubscriptionAccessService,
    AdminBillingService,
    SubscriptionRenewalService,
    BillingAttemptOrchestrationService,
    BillingLifecycleService,
    BillingHostedCompletionService,
    BillingReconciliationService,
    BillingProviderRuntimeService,
    BillingCardcomExecutorService,
    {
      provide: BILLING_CARD_COM_EXECUTOR,
      useExisting: BillingCardcomExecutorService,
    },
    SubscriptionGuard,
  ],
  exports: [
    BillingService,
    BillingAttemptOrchestrationService,
    BillingLifecycleService,
    SubscriptionAccessService,
    SubscriptionGuard,
  ],
})
export class BillingModule {}
