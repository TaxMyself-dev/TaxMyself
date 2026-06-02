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
import { CardcomCheckoutSession } from '../entities/cardcom-checkout-session.entity';
import { User } from 'src/users/user.entity';
import { ModuleName, PayStatus } from 'src/enum';
import { BillingEventService } from './billing-event.service';
import { PricingService } from './pricing.service';
import { SubscriptionAccessService } from './subscription-access.service';
import { CardcomService, CardcomApiError } from './cardcom.service';
import {
  BillingEventType,
  CheckoutSessionStatus,
  SubscriptionStatus,
} from '../enums/billing.enums';
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
    private readonly cardcomService: CardcomService,
  ) {}

  // ─── Plans ──────────────────────────────────────────────────────────────────

  async getPlans(): Promise<SubscriptionPlan[]> {
    return this.planRepo.find({
      where: { isActive: true, isPublic: true },
      order: { displayOrder: 'ASC' },
    });
  }

  // ─── Billing state ───────────────────────────────────────────────────────────

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
   * Creates a PENDING checkout session, calls CardCom LowProfile/Create to
   * obtain a hosted payment page URL, stores the LowProfileId, and returns
   * the payment URL to the frontend.
   *
   * Subscription activation happens later, exclusively via the CardCom webhook
   * handler (POST /billing/cardcom/webhook — not yet implemented).
   *
   * Error handling:
   * - If CardCom fails: session is marked FAILED, PAYMENT_FAILED event is logged,
   *   and a 502 is returned to the frontend.
   * - If the DB update after CardCom succeeds fails: the payment URL is still
   *   returned (see risk note below), but the failure is logged at CRITICAL level.
   *
   * Risk: if the DB update of cardcomLowProfileId fails, the session row will not
   * have the LowProfileId stored. The webhook handler uses ReturnValue (=sessionId)
   * to look up the session, so payment processing will still work. However,
   * operator visibility into which session maps to which LowProfileId is lost
   * for that session. Monitoring for sessions with status=PENDING and
   * cardcomLowProfileId=NULL that are past expiresAt is recommended.
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
      dto.couponCode,
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHECKOUT_SESSION_TTL_MINUTES * 60 * 1000);

    // Persist the session first so we have a stable ID to pass to CardCom as ReturnValue.
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
    });

    const savedSession = await this.checkoutSessionRepo.save(session);

    // ── CardCom LowProfile/Create ─────────────────────────────────────────────

    let cardcomResult: { lowProfileId: string; paymentUrl: string; rawResponse: Record<string, any> };

    try {
      // Fetch user profile for customer info (best-effort — optional fields).
      const user = await this.userRepo.findOne({ where: { firebaseId } }).catch(() => null);

      cardcomResult = await this.cardcomService.createLowProfileCheckout({
        checkoutSessionId: savedSession.id,
        firebaseId,
        amountAgorot: pricing.finalAmountAgorot,
        planName: plan.name,
        customerEmail: user?.email ?? null,
        customerName: user?.fName ? `${user.fName} ${user.lName ?? ''}`.trim() : null,
        customerPhone: user?.phone ?? null,
      });
    } catch (err) {
      // CardCom call failed — mark session as FAILED and surface a clean error.
      await this.markSessionFailed(savedSession.id);
      await this.billingEventService.logEvent({
        firebaseId,
        eventType: BillingEventType.PAYMENT_FAILED,
        subscriptionId: subscription.id,
        checkoutSessionId: savedSession.id,
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
        `CardCom LowProfile/Create failed for session #${savedSession.id}: ${(err as Error)?.message}`,
      );
      throw new BadGatewayException(
        'Payment gateway unavailable. Please try again in a few minutes.',
      );
    }

    // ── Persist CardCom data on the session ───────────────────────────────────

    let paymentUrlToReturn = cardcomResult.paymentUrl;

    try {
      await this.checkoutSessionRepo.update(savedSession.id, {
        cardcomLowProfileId: cardcomResult.lowProfileId,
        rawCardcomResponse: cardcomResult.rawResponse,
      });
    } catch (dbErr) {
      // DB update failed AFTER CardCom already created the payment page.
      // Risk: session row lacks LowProfileId, but webhook handler uses ReturnValue
      // (=sessionId) so payment processing is still possible.
      // The CHECKOUT_CREATED event below still includes lowProfileId in metadata.
      this.logger.error(
        `CRITICAL: CardCom payment page created (lowProfileId=${cardcomResult.lowProfileId}) ` +
          `but DB update for session #${savedSession.id} failed. ` +
          `Session will stay PENDING without LowProfileId. Webhook can still process via ReturnValue. ` +
          `Error: ${(dbErr as Error)?.message}`,
      );
    }

    // ── Audit event ───────────────────────────────────────────────────────────

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
        cardcomLowProfileId: cardcomResult.lowProfileId,
      },
    });

    this.logger.log(
      `Checkout session #${savedSession.id} ready: plan=${plan.slug} ` +
        `amount=${pricing.finalAmountAgorot} agorot lowProfileId=${cardcomResult.lowProfileId}`,
    );

    return {
      checkoutSessionId: savedSession.id,
      paymentUrl: paymentUrlToReturn,
      finalAmountAgorot: savedSession.finalAmountAgorot,
      currency: savedSession.currency,
      expiresAt: savedSession.expiresAt,
    };
  }

  // ─── Checkout status ─────────────────────────────────────────────────────────

  /**
   * Returns the current status of a checkout session.
   * Used by the Angular success/failed page to confirm payment outcome before
   * showing confirmation UI — the webhook may have processed before the user
   * is redirected back.
   */
  async getCheckoutStatus(firebaseId: string, sessionId: number) {
    const session = await this.checkoutSessionRepo.findOne({
      where: { id: sessionId },
    });

    if (!session || session.firebaseId !== firebaseId) {
      throw new NotFoundException(`Checkout session #${sessionId} not found`);
    }

    const subscription = await this.subscriptionRepo.findOne({
      where: { id: session.subscriptionId },
    });

    const isCompleted = session.status === CheckoutSessionStatus.COMPLETED;
    const isSubscriptionActive = subscription?.status === SubscriptionStatus.ACTIVE;

    return {
      checkoutSessionId: session.id,
      status: session.status,
      finalAmountAgorot: session.finalAmountAgorot,
      currency: session.currency,
      cardcomLowProfileId: session.cardcomLowProfileId,
      expiresAt: session.expiresAt,
      paidAt: session.paidAt,
      isCompleted,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            isActive: isSubscriptionActive,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async markSessionFailed(sessionId: number): Promise<void> {
    try {
      await this.checkoutSessionRepo.update(sessionId, {
        status: CheckoutSessionStatus.FAILED,
      });
    } catch (err) {
      this.logger.error(
        `Failed to mark checkout session #${sessionId} as FAILED: ${(err as Error)?.message}`,
      );
    }
  }

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
   * SubscriptionGuard and getBillingStatus are replaced.
   * Best-effort — failures are logged but never break the main flow.
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
