import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { CardcomCheckoutSession } from '../entities/cardcom-checkout-session.entity';
import { User } from 'src/users/user.entity';
import { ModuleName, PayStatus } from 'src/enum';
import { BillingEventService } from './billing-event.service';
import { PricingService } from './pricing.service';
import { SubscriptionAccessService } from './subscription-access.service';
import { BillingEventType, CheckoutSessionStatus, SubscriptionStatus } from '../enums/billing.enums';
import { CheckoutPreviewDto } from '../dtos/checkout-preview.dto';
import { CreateCheckoutDto } from '../dtos/create-checkout.dto';

/** Default trial length when no plan is selected yet. */
const TRIAL_DURATION_DAYS = 14;

/** How long a checkout session stays valid. */
const CHECKOUT_SESSION_TTL_MINUTES = 60;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(CardcomCheckoutSession)
    private readonly checkoutSessionRepo: Repository<CardcomCheckoutSession>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly pricingService: PricingService,
    private readonly billingEventService: BillingEventService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
  ) {}

  // ─── Plans ──────────────────────────────────────────────────────────────────

  /**
   * Returns all active, public, non-deleted plans sorted by displayOrder.
   * Soft-deleted plans are excluded automatically by TypeORM.
   */
  async getPlans(): Promise<SubscriptionPlan[]> {
    return this.planRepo.find({
      where: { isActive: true, isPublic: true },
      order: { displayOrder: 'ASC' },
    });
  }

  // ─── Billing state ───────────────────────────────────────────────────────────

  /**
   * Returns the full billing state for the current user.
   * If no subscription exists, returns a clear "no subscription" state so the
   * frontend can show a "Start Trial" CTA.
   */
  async getMyBillingState(firebaseId: string) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { firebaseId },
    });

    if (!subscription) {
      return this.buildNoSubscriptionResponse();
    }

    let plan: SubscriptionPlan | null = null;
    if (subscription.planId) {
      plan = await this.planRepo.findOne({ where: { id: subscription.planId } });
    }

    return this.buildBillingStateResponse(subscription, plan);
  }

  // ─── Trial ───────────────────────────────────────────────────────────────────

  /**
   * Idempotent: creates a trial subscription if one does not exist.
   * If a subscription already exists, returns its current billing state.
   *
   * Also temporarily syncs legacy User fields (payStatus, modulesAccess, etc.)
   * until the old subscription guard is replaced.
   */
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

    // Sync legacy User fields so existing SubscriptionGuard keeps working.
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

  /**
   * Calculates the checkout price without creating any session.
   * Can be called without a subscription (e.g., to show pricing on landing pages).
   */
  async previewCheckout(firebaseId: string, dto: CheckoutPreviewDto) {
    const pricing = await this.pricingService.calculateCheckoutPrice(
      firebaseId,
      dto.planId,
      dto.couponCode,
    );

    return {
      originalAmountAgorot: pricing.originalAmountAgorot,
      discountAmountAgorot: pricing.discountAmountAgorot,
      finalAmountAgorot: pricing.finalAmountAgorot,
      currency: pricing.currency,
      appliedSubscriptionDiscount: pricing.appliedSubscriptionDiscount
        ? {
            id: pricing.appliedSubscriptionDiscount.id,
            discountType: pricing.appliedSubscriptionDiscount.discountType,
            discountValueAgorot: pricing.appliedSubscriptionDiscount.discountValueAgorot,
            discountPercent: pricing.appliedSubscriptionDiscount.discountPercent,
            durationType: pricing.appliedSubscriptionDiscount.durationType,
            reasonCode: pricing.appliedSubscriptionDiscount.reasonCode,
          }
        : null,
      appliedPromotion: pricing.appliedPromotion
        ? {
            id: pricing.appliedPromotion.id,
            name: pricing.appliedPromotion.name,
            discountType: pricing.appliedPromotion.discountType,
            discountValueAgorot: pricing.appliedPromotion.discountValueAgorot,
            discountPercent: pricing.appliedPromotion.discountPercent,
            durationType: pricing.appliedPromotion.durationType,
          }
        : null,
      appliedCoupon: pricing.appliedCoupon
        ? {
            id: pricing.appliedCoupon.id,
            code: pricing.appliedCoupon.code,
            discountType: pricing.appliedCoupon.discountType,
            discountValueAgorot: pricing.appliedCoupon.discountValueAgorot,
            discountPercent: pricing.appliedCoupon.discountPercent,
            durationType: pricing.appliedCoupon.durationType,
          }
        : null,
      explanation: pricing.explanation,
    };
  }

  // ─── Checkout ────────────────────────────────────────────────────────────────

  /**
   * Creates a PENDING checkout session.
   * The subscription must already exist (call POST /billing/trial first).
   *
   * CardCom LowProfile creation will be added here in the next step:
   *   TODO: After persisting the session:
   *   1. Call CardCom API to create a hosted payment page (CreateLowProfile).
   *   2. Receive LowProfileId and the hosted payment URL from CardCom response.
   *   3. Update session.cardcomLowProfileId = lowProfileId.
   *   4. Return cardcomCheckoutUrl to the frontend so it can redirect.
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

    // Validate the plan exists and is purchasable.
    const plan = await this.planRepo.findOne({
      where: { id: dto.planId, isActive: true },
    });

    if (!plan) {
      throw new BadRequestException('Subscription plan not found or not available');
    }

    // Calculate pricing.
    const pricing = await this.pricingService.calculateCheckoutPrice(
      firebaseId,
      dto.planId,
      dto.couponCode,
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHECKOUT_SESSION_TTL_MINUTES * 60 * 1000);

    const session = this.checkoutSessionRepo.create({
      firebaseId,
      subscriptionId: subscription.id,
      planId: plan.id,
      status: CheckoutSessionStatus.PENDING,
      originalAmountAgorot: pricing.originalAmountAgorot,
      discountAmountAgorot: pricing.discountAmountAgorot,
      finalAmountAgorot: pricing.finalAmountAgorot,
      currency: pricing.currency,
      couponId: pricing.appliedCoupon?.id ?? null,
      promotionId: pricing.appliedPromotion?.id ?? null,
      subscriptionDiscountId: pricing.appliedSubscriptionDiscount?.id ?? null,
      expiresAt,
      // cardcomLowProfileId: null — populated after CardCom API call (TODO above)
    });

    const savedSession = await this.checkoutSessionRepo.save(session);

    // Write immutable audit event.
    await this.billingEventService.logEvent({
      firebaseId,
      eventType: BillingEventType.CHECKOUT_CREATED,
      subscriptionId: subscription.id,
      checkoutSessionId: savedSession.id,
      amountAgorot: pricing.finalAmountAgorot,
      currency: pricing.currency,
      metadata: {
        planId: plan.id,
        planSlug: plan.slug,
        couponCode: dto.couponCode ?? null,
        pricingExplanation: pricing.explanation,
      },
    });

    this.logger.log(
      `Checkout session #${savedSession.id} created for firebaseId=${firebaseId.substring(0, 8)}... ` +
        `plan=${plan.slug}, finalAmount=${pricing.finalAmountAgorot} agorot`,
    );

    return {
      checkoutSessionId: savedSession.id,
      status: savedSession.status,
      originalAmountAgorot: savedSession.originalAmountAgorot,
      discountAmountAgorot: savedSession.discountAmountAgorot,
      finalAmountAgorot: savedSession.finalAmountAgorot,
      currency: savedSession.currency,
      expiresAt: savedSession.expiresAt,
      // TODO: cardcomCheckoutUrl will be added here after CardCom integration
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildNoSubscriptionResponse() {
    return {
      hasSubscription: false,
      subscription: null,
      plan: null,
      access: {
        modulesAccess: [] as ModuleName[],
        isTrialActive: false,
        isPaymentRequired: false,
        isPastDue: false,
        gracePeriodActive: false,
      },
    };
  }

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
            currency: plan.currency,
            modules: plan.modules ?? [],
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
   * Temporary bridge: keeps legacy User fields in sync until the old
   * SubscriptionGuard and getBillingStatus are replaced with the new system.
   * This method is intentionally best-effort — failures are logged but do not
   * break the main flow.
   */
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
