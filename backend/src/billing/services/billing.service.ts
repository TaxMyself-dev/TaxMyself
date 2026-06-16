import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from 'src/users/user.entity';
import { ModuleName, PayStatus } from 'src/enum';
import { BillingEventService } from './billing-event.service';
import { PricingService } from './pricing.service';
import { SubscriptionAccessService } from './subscription-access.service';
import { CardcomService, CardcomApiError } from './cardcom.service';
import { BillingEventType, SubscriptionStatus } from '../enums/billing.enums';
import { CheckoutPreviewDto } from '../dtos/checkout-preview.dto';
import { CreateCheckoutDto } from '../dtos/create-checkout.dto';

/** Default trial length when no plan is selected yet. */
const TRIAL_DURATION_DAYS = 14;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly pricingService: PricingService,
    private readonly billingEventService: BillingEventService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
    private readonly cardcomService: CardcomService,
  ) {}

  // ─── Plans ──────────────────────────────────────────────────────────────────

  async getPlans() {
    const plans = await this.planRepo.find({
      where: { isActive: true, isPublic: true },
      order: { displayOrder: 'ASC' },
    });
    return plans.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      priceMonthlyAgorot: p.priceMonthlyAgorot,
      licensedDealerPriceMonthlyAgorot: p.licensedDealerPriceMonthlyAgorot,
      notes: p.notes,
      badge: p.badge,
      features: p.features,
      modules: p.modules ?? [],
      trialDays: p.trialDays,
      displayOrder: p.displayOrder,
      active: p.isActive,
    }));
  }

  // ─── Billing state ───────────────────────────────────────────────────────────

  async getMyBillingState(firebaseId: string) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { firebaseId },
    });

    if (!subscription) {
      // Auto-provision a trial so new users always land in TRIAL state.
      // ensureTrialSubscription is idempotent and handles the unique-constraint race.
      return this.ensureTrialSubscription(firebaseId);
    }

    const current = await this.enforceSubscriptionLifecycle(firebaseId, subscription);

    let plan: SubscriptionPlan | null = null;
    if (current.planId) {
      plan = await this.planRepo.findOne({ where: { id: current.planId } });
    }

    return this.buildBillingStateResponse(current, plan);
  }

  // ─── Trial ───────────────────────────────────────────────────────────────────

  async ensureTrialSubscription(firebaseId: string) {
    const existing = await this.subscriptionRepo.findOne({
      where: { firebaseId },
    });

    if (existing) {
      let plan: SubscriptionPlan | null = null;
      if (existing.planId) {
        plan = await this.planRepo.findOne({ where: { id: existing.planId } });
      }
      return this.buildBillingStateResponse(existing, plan);
    }

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DURATION_DAYS);

    const subscription = this.subscriptionRepo.create({
      firebaseId,
      status: SubscriptionStatus.TRIAL,
      planId: null,
      paymentMethodId: null,
      trialStart: now,
      trialEnd,
    });

    const saved = await this.subscriptionRepo.save(subscription);

    await this.syncLegacyUserFields(firebaseId, {
      payStatus: PayStatus.TRIAL,
      modulesAccess: Object.values(ModuleName),
      subscriptionEndDate: trialEnd,
      nextBillingDate: null,
    });

    this.logger.log(
      `Trial subscription created for firebaseId=${firebaseId.substring(0, 8)}... trialEnd=${trialEnd.toISOString()}`,
    );

    return this.buildBillingStateResponse(saved, null);
  }

  // ─── Checkout preview ────────────────────────────────────────────────────────

  async previewCheckout(firebaseId: string, dto: CheckoutPreviewDto) {
    const pricing = await this.pricingService.calculateCheckoutPrice(
      firebaseId,
      dto.planId,
    );

    return {
      originalAmountAgorot: pricing.originalAmountAgorot,
      discountAmountAgorot: pricing.discountAmountAgorot,
      finalAmountAgorot: pricing.finalAmountAgorot,
      currency: pricing.currency,
      explanation: pricing.explanation,
    };
  }

  // ─── Checkout ────────────────────────────────────────────────────────────────

  /**
   * Calls CardCom LowProfile/Create to obtain a hosted payment page URL.
   * Passes firebaseId, planId, subscriptionId as JSON in ReturnValue so the
   * webhook handler can activate the subscription without a session table.
   *
   * Subscription activation happens later, exclusively via the CardCom webhook
   * handler (POST /billing/cardcom/webhook).
   */
  async createCheckout(firebaseId: string, dto: CreateCheckoutDto) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { firebaseId },
    });

    if (!subscription) {
      throw new BadRequestException(
        'No subscription found. Call POST /billing/trial to start your trial before checkout.',
      );
    }

    const plan = await this.planRepo.findOne({
      where: { id: dto.planId, isActive: true },
    });

    if (!plan) {
      throw new BadRequestException('Subscription plan not found or not available');
    }

    const pricing = await this.pricingService.calculateCheckoutPrice(
      firebaseId,
      dto.planId,
    );

    // Fetch user profile for customer info (best-effort — optional fields).
    const user = await this.userRepo.findOne({ where: { firebaseId } }).catch(() => null);

    let cardcomResult: { lowProfileId: string; paymentUrl: string; rawResponse: Record<string, any> };

    try {
      cardcomResult = await this.cardcomService.createLowProfileCheckout({
        firebaseId,
        planId: plan.id,
        subscriptionId: subscription.id,
        amountAgorot: pricing.finalAmountAgorot,
        planName: plan.name,
        customerEmail: user?.email ?? null,
        customerName: user?.fName ? `${user.fName} ${user.lName ?? ''}`.trim() : null,
        customerPhone: user?.phone ?? null,
      });
    } catch (err) {
      await this.billingEventService.logEvent({
        firebaseId,
        eventType: BillingEventType.PAYMENT_FAILED,
        subscriptionId: subscription.id,
        amountAgorot: pricing.finalAmountAgorot,
        currency: pricing.currency,
        metadata: {
          planId: plan.id,
          planSlug: plan.slug,
          cardcomError:
            err instanceof CardcomApiError
              ? {
                  message: err.message,
                  responseCode: err.responseCode,
                  cardcomDescription: err.cardcomDescription,
                }
              : { message: (err as Error)?.message ?? 'Unknown error' },
        },
      });

      this.logger.error(
        `CardCom LowProfile/Create failed for plan=${plan.slug} subscription=${subscription.id}: ${(err as Error)?.message}`,
      );
      throw new BadGatewayException(
        'Payment gateway unavailable. Please try again in a few minutes.',
      );
    }

    await this.billingEventService.logEvent({
      firebaseId,
      eventType: BillingEventType.CHECKOUT_CREATED,
      subscriptionId: subscription.id,
      amountAgorot: pricing.finalAmountAgorot,
      currency: pricing.currency,
      metadata: {
        planId: plan.id,
        planSlug: plan.slug,
        pricingExplanation: pricing.explanation,
        cardcomLowProfileId: cardcomResult.lowProfileId,
      },
    });

    this.logger.log(
      `Checkout ready: plan=${plan.slug} subscription=${subscription.id} ` +
        `amount=${pricing.finalAmountAgorot} agorot lowProfileId=${cardcomResult.lowProfileId}`,
    );

    return {
      paymentUrl: cardcomResult.paymentUrl,
      finalAmountAgorot: pricing.finalAmountAgorot,
      currency: pricing.currency,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildBillingStateResponse(
    subscription: Subscription,
    plan: SubscriptionPlan | null,
  ) {
    const modulesAccess = this.subscriptionAccessService.resolveModulesAccess(
      subscription,
      plan,
    );

    return {
      hasSubscription: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        trialStart: subscription.trialStart,
        trialEnd: subscription.trialEnd,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        nextBillingDate: subscription.nextBillingDate,
        gracePeriodEndsAt: subscription.gracePeriodEndsAt,
        canceledAt: subscription.canceledAt,
        createdAt: subscription.createdAt,
      },
      plan: plan
        ? {
            id: plan.id,
            slug: plan.slug,
            name: plan.name,
            priceMonthlyAgorot: plan.priceMonthlyAgorot,
            licensedDealerPriceMonthlyAgorot: plan.licensedDealerPriceMonthlyAgorot,
            currency: plan.currency,
            modules: plan.modules ?? [],
            features: plan.features,
            badge: plan.badge,
            notes: plan.notes,
            trialDays: plan.trialDays,
          }
        : null,
      access: {
        modulesAccess,
        isTrialActive: this.subscriptionAccessService.isTrialActive(subscription),
        isPaymentRequired: this.subscriptionAccessService.isPaymentRequired(subscription),
        isPastDue: subscription.status === SubscriptionStatus.PAST_DUE,
        gracePeriodActive: this.subscriptionAccessService.gracePeriodActive(subscription),
      },
    };
  }

  /**
   * Evaluates and enforces subscription lifecycle transitions.
   * Persists any state changes and keeps legacy User fields in sync.
   * Returns the subscription with its current (possibly updated) status.
   *
   * Current rules:
   *   TRIAL + trialEnd < now → TRIAL_EXPIRED
   */
  private async enforceSubscriptionLifecycle(
    firebaseId: string,
    subscription: Subscription,
  ): Promise<Subscription> {
    if (
      subscription.status === SubscriptionStatus.TRIAL &&
      subscription.trialEnd !== null &&
      subscription.trialEnd < new Date()
    ) {
      subscription.status = SubscriptionStatus.TRIAL_EXPIRED;
      await this.subscriptionRepo.save(subscription);
      await this.syncLegacyUserFields(firebaseId, {
        payStatus: PayStatus.PAYMENT_REQUIRED,
        modulesAccess: [],
        subscriptionEndDate: subscription.trialEnd,
        nextBillingDate: null,
      });
    }

    return subscription;
  }

  private async syncLegacyUserFields(
    firebaseId: string,
    fields: {
      payStatus: PayStatus;
      modulesAccess: ModuleName[];
      subscriptionEndDate: Date | null;
      nextBillingDate: Date | null;
    },
  ): Promise<void> {
    try {
      const user = await this.userRepo.findOne({ where: { firebaseId } });
      if (!user) return;

      user.payStatus = fields.payStatus;
      user.modulesAccess = fields.modulesAccess;
      user.subscriptionEndDate = fields.subscriptionEndDate as Date;
      user.nextBillingDate = fields.nextBillingDate as Date;

      await this.userRepo.save(user);
    } catch (error) {
      this.logger.error(
        `Failed to sync legacy User fields for firebaseId=${firebaseId}: ${(error as Error)?.message ?? error}`,
        (error as Error)?.stack,
      );
    }
  }
}
