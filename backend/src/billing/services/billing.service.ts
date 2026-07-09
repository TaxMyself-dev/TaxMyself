import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { CardcomWebhookLog } from '../entities/cardcom-webhook-log.entity';
import { User } from 'src/users/user.entity';
import { ModuleName } from 'src/enum';
import { DocumentsService } from 'src/documents/documents.service';
import { BillingEventService } from './billing-event.service';
import { BillingReceiptService } from './billing-receipt.service';
import { PricingService } from './pricing.service';
import { SubscriptionAccessService } from './subscription-access.service';
import { CardcomService, CardcomApiError } from './cardcom.service';
import { BillingEventType, SubscriptionStatus, WebhookLogStatus } from '../enums/billing.enums';
import { CheckoutPreviewDto } from '../dtos/checkout-preview.dto';
import { CreateCheckoutDto } from '../dtos/create-checkout.dto';

/** One row of the user-facing payment history (GET /billing/payments). */
export interface PaymentHistoryRow {
  eventId: number;
  date: Date;
  planName: string | null;
  amountAgorot: number | null;
  currency: string;
  status: 'SUCCESS' | 'FAILED';
  receiptDocId: number | null;
  /**
   * True only when the receipt is genuinely downloadable: receiptDocId is set,
   * the Documents row exists, AND it has a file path. Not merely receiptDocId != null.
   */
  receiptAvailable: boolean;
  /**
   * Whether this event supports a (future) retry-payment action. Determined
   * explicitly from the event type, not inferred from SUCCESS/FAILED status.
   */
  canRetry: boolean;
}

/** Event types that support a retry-payment action (Phase 2 wires the real flow). */
const RETRYABLE_EVENT_TYPES: readonly BillingEventType[] = [
  BillingEventType.PAYMENT_FAILED,
  BillingEventType.RENEWAL_FAILED,
];

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepo: Repository<PaymentMethod>,
    @InjectRepository(CardcomWebhookLog)
    private readonly webhookLogRepo: Repository<CardcomWebhookLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly pricingService: PricingService,
    private readonly billingEventService: BillingEventService,
    private readonly billingReceiptService: BillingReceiptService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
    private readonly cardcomService: CardcomService,
    private readonly documentsService: DocumentsService,
  ) {}

  // ─── Plans ──────────────────────────────────────────────────────────────────

  /**
   * Returns all active, public plans with the price effective for the
   * requesting user's billing business type — resolved once from their
   * businesses and applied to every plan, so the frontend never has to
   * decide between the exempt-dealer and licensed-dealer price itself.
   */
  async getPlans(firebaseId: string) {
    const [plans, billingBusinessType] = await Promise.all([
      this.planRepo.find({
        where: { isActive: true, isPublic: true },
        order: { displayOrder: 'ASC' },
      }),
      this.pricingService.resolveUserBillingBusinessType(firebaseId),
    ]);

    return plans.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      priceMonthlyAgorot: p.priceMonthlyAgorot,
      licensedDealerPriceMonthlyAgorot: p.licensedDealerPriceMonthlyAgorot,
      effectivePriceMonthlyAgorot: this.pricingService.resolveEffectivePlanPrice(p, billingBusinessType),
      effectiveBillingBusinessType: billingBusinessType,
      notes: p.notes,
      badge: p.badge,
      recommended: p.recommended,
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

    return this.buildBillingStateResponse(current, plan, firebaseId);
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
      return this.buildBillingStateResponse(existing, plan, firebaseId);
    }

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + Number(process.env.TRIAL_DAYS));

    const subscription = this.subscriptionRepo.create({
      firebaseId,
      status: SubscriptionStatus.TRIAL,
      planId: null,
      paymentMethodId: null,
      trialStart: now,
      trialEnd,
    });

    const saved = await this.subscriptionRepo.save(subscription);

    this.logger.log(
      `Trial subscription created for firebaseId=${firebaseId.substring(0, 8)}... trialEnd=${trialEnd.toISOString()}`,
    );

    return this.buildBillingStateResponse(saved, null, firebaseId);
  }

  // ─── Access ──────────────────────────────────────────────────────────────────

  /**
   * Single source of truth for module access checks. Resolves the user's
   * Subscription + SubscriptionPlan and delegates to SubscriptionAccessService.
   */
  async hasModuleAccess(firebaseId: string, module: ModuleName): Promise<boolean> {
    const subscription = await this.subscriptionRepo.findOne({ where: { firebaseId } });
    if (!subscription) return false;

    let plan: SubscriptionPlan | null = null;
    if (subscription.planId) {
      plan = await this.planRepo.findOne({ where: { id: subscription.planId } });
    }

    const modulesAccess = this.subscriptionAccessService.resolveModulesAccess(subscription, plan);
    return modulesAccess.includes(module);
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
      amountBeforeVatAgorot: pricing.amountBeforeVatAgorot,
      vatRate: pricing.vatRate,
      vatAmountAgorot: pricing.vatAmountAgorot,
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
      amountBeforeVatAgorot: pricing.amountBeforeVatAgorot,
      vatAmountAgorot: pricing.vatAmountAgorot,
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
        `billingBusinessType=${pricing.billingBusinessType} ` +
        `amount=${pricing.finalAmountAgorot} agorot lowProfileId=${cardcomResult.lowProfileId}`,
    );

    return {
      paymentUrl: cardcomResult.paymentUrl,
      finalAmountAgorot: pricing.finalAmountAgorot,
      currency: pricing.currency,
    };
  }

  // ─── Receipt retry ───────────────────────────────────────────────────────────

  /**
   * Re-sends the receipt email for an existing PAYMENT_SUCCESS billing event.
   * Validates that the authenticated user owns the event and that a receipt
   * document has already been created, then delegates to BillingReceiptService.
   * Refuses to create a new document — for that use generateMissingReceipt().
   */
  async resendReceiptEmail(
    firebaseId: string,
    eventId: number,
  ): Promise<{ sent: boolean; error?: string }> {
    const event = await this.billingEventService.findPaymentEventById(eventId);

    if (!event || event.firebaseId !== firebaseId) {
      throw new NotFoundException('Payment event not found');
    }

    if (event.eventType !== BillingEventType.PAYMENT_SUCCESS) {
      throw new BadRequestException('Only PAYMENT_SUCCESS events have receipt emails');
    }

    if (!event.receiptDocId) {
      throw new BadRequestException(
        'Receipt document not yet created for this payment event. ' +
          'Wait for the webhook to complete or contact support.',
      );
    }

    return this.billingReceiptService.sendReceiptEmailForPaymentEvent(eventId);
  }

  /**
   * Generates a missing receipt for a PAYMENT_SUCCESS event (INVOICE_FAILED case).
   * Idempotent: if a receipt already exists, skips creation and resends the email.
   * Never creates a duplicate document.
   */
  async generateMissingReceipt(
    firebaseId: string,
    eventId: number,
  ): Promise<{ created: boolean; sent: boolean; error?: string }> {
    const event = await this.billingEventService.findPaymentEventById(eventId);

    if (!event || event.firebaseId !== firebaseId) {
      throw new NotFoundException('Payment event not found');
    }

    if (event.eventType !== BillingEventType.PAYMENT_SUCCESS) {
      throw new BadRequestException('Only PAYMENT_SUCCESS events can have receipts generated');
    }

    // Idempotent: receipt already exists — skip creation, only resend email.
    if (event.receiptDocId != null) {
      this.logger.log(
        `generateMissingReceipt: receipt already exists (receiptDocId=${event.receiptDocId}), skipping creation`,
      );
      const emailResult = await this.billingReceiptService.sendReceiptEmailForPaymentEvent(eventId);
      return { created: false, sent: emailResult.sent, error: emailResult.error };
    }

    if (!event.subscriptionId) {
      throw new BadRequestException('Payment event has no associated subscription');
    }

    // Canonical VAT breakdown from CHECKOUT_CREATED — never recalculate.
    const breakdown = await this.billingEventService.findCheckoutBreakdown(event.subscriptionId);
    if (!breakdown) {
      throw new BadRequestException(
        'Cannot regenerate receipt: VAT breakdown not found. Please contact support.',
      );
    }

    const subscription = await this.subscriptionRepo.findOne({ where: { id: event.subscriptionId } });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.planId) {
      throw new BadRequestException('Subscription has no plan — cannot generate receipt');
    }

    const plan = await this.planRepo.findOne({ where: { id: subscription.planId } });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    const periodStart = subscription.currentPeriodStart ?? new Date();
    const periodEnd = subscription.currentPeriodEnd ?? new Date();

    const receipt = await this.billingReceiptService.createReceiptForPayment({
      firebaseId,
      subscriptionId: event.subscriptionId,
      amountBeforeVatAgorot: breakdown.amountBeforeVatAgorot,
      vatAmountAgorot: breakdown.vatAmountAgorot,
      amountIncludingVatAgorot: breakdown.amountIncludingVatAgorot,
      planName: plan.name,
      periodStart,
      periodEnd,
      cardcomDealNumber: event.cardcomDealNumber,
    });

    // Link receipt to the PAYMENT_SUCCESS event — idempotency anchor for subsequent retries.
    await this.billingEventService.updatePaymentEventWithReceipt(eventId, receipt.receiptDocId);

    // Generate PDFs and upload to Firebase.
    await this.billingReceiptService.finalizeBillingReceiptPdfs(receipt.receiptDocId, firebaseId);

    // Send receipt email.
    const emailResult = await this.billingReceiptService.sendReceiptEmailForPaymentEvent(eventId);

    this.logger.log(
      `generateMissingReceipt: receipt created and sent: receiptDocId=${receipt.receiptDocId} eventId=${eventId}`,
    );

    return { created: true, sent: emailResult.sent, error: emailResult.error };
  }

  // ─── Payment history ───────────────────────────────────────────────────────

  /**
   * Returns the authenticated user's payment history for the read-only
   * "My Subscription" tab. Reuses BillingEventService for the ledger rows and
   * resolves plan names from the planId stored on each event's metadata.
   */
  async getUserPaymentHistory(firebaseId: string): Promise<PaymentHistoryRow[]> {
    const events = await this.billingEventService.findUserPaymentHistory(firebaseId);
    if (events.length === 0) return [];

    // Plan resolution strategy, most reliable first:
    //   1. event.metadata.planId — the plan charged at the time of the event.
    //      Set on every checkout-driven PAYMENT_SUCCESS, and stays historically
    //      correct even after the user later changes plans.
    //   2. Fallback: the plan of the event's subscription. RENEWAL_SUCCESS and
    //      PAYMENT_FAILED never carry planId in metadata, and some legacy
    //      PAYMENT_SUCCESS rows predate it. Only resolves while the subscription
    //      still exists — deleted subscriptions fall through to null ("—").
    const planIds = new Set<number>();
    const subscriptionIds = new Set<number>();
    for (const event of events) {
      const planId = event.metadata?.planId;
      if (typeof planId === 'number') planIds.add(planId);
      if (event.subscriptionId != null) subscriptionIds.add(event.subscriptionId);
    }

    // subscriptionId → planId, for events lacking metadata.planId.
    const subscriptionPlanId = new Map<number, number>();
    if (subscriptionIds.size > 0) {
      const subs = await this.subscriptionRepo.find({
        where: { id: In([...subscriptionIds]) },
        select: ['id', 'planId'],
      });
      for (const sub of subs) {
        if (sub.planId != null) {
          subscriptionPlanId.set(sub.id, sub.planId);
          planIds.add(sub.planId);
        }
      }
    }

    const planNameById = new Map<number, string>();
    if (planIds.size > 0) {
      const plans = await this.planRepo.find({ where: { id: In([...planIds]) } });
      for (const plan of plans) planNameById.set(plan.id, plan.name);
    }

    // Truthful receipt availability: a receipt is only downloadable when its
    // Documents row exists AND has a file path. receiptDocId alone is unreliable —
    // rows can reference deleted or never-finalized documents. Resolved via
    // DocumentsService so no new Firebase/document logic is introduced here.
    const receiptDocIds = events
      .map(e => e.receiptDocId)
      .filter((id): id is number => id != null);
    const downloadableReceiptIds =
      await this.documentsService.findDownloadableBillingReceiptDocIds(receiptDocIds);

    const successTypes: BillingEventType[] = [
      BillingEventType.PAYMENT_SUCCESS,
      BillingEventType.RENEWAL_SUCCESS,
    ];

    return events.map((event): PaymentHistoryRow => {
      const planId =
        typeof event.metadata?.planId === 'number'
          ? event.metadata.planId
          : event.subscriptionId != null
            ? (subscriptionPlanId.get(event.subscriptionId) ?? null)
            : null;
      return {
        eventId: event.id,
        date: event.createdAt,
        planName: planId != null ? (planNameById.get(planId) ?? null) : null,
        amountAgorot: event.amountAgorot,
        currency: event.currency,
        status: successTypes.includes(event.eventType) ? 'SUCCESS' : 'FAILED',
        receiptDocId: event.receiptDocId,
        receiptAvailable:
          event.receiptDocId != null && downloadableReceiptIds.has(event.receiptDocId),
        canRetry: RETRYABLE_EVENT_TYPES.includes(event.eventType),
      };
    });
  }

  /**
   * Returns the receipt PDF for a payment event the authenticated user owns.
   * Verifies ownership, then reuses DocumentsService.getBillingReceiptPdf —
   * no new Firebase download logic is introduced here.
   */
  async getPaymentReceiptPdf(
    firebaseId: string,
    eventId: number,
  ): Promise<{ buffer: Buffer; docType: string; docNumber: string; generalDocIndex: string }> {
    const event = await this.billingEventService.findPaymentEventById(eventId);

    if (!event || event.firebaseId !== firebaseId) {
      throw new NotFoundException('Payment event not found');
    }

    if (!event.receiptDocId) {
      throw new NotFoundException('לא קיים מסמך עבור תשלום זה');
    }

    // Verify the document exists AND has a downloadable file BEFORE downloading,
    // so a missing/incomplete receipt returns a clean 404 rather than letting an
    // EntityNotFoundError bubble up as a 500. No exceptions used for control flow.
    const downloadable = await this.documentsService.isBillingReceiptDownloadable(
      event.receiptDocId,
    );
    if (!downloadable) {
      throw new NotFoundException('לא קיים מסמך עבור תשלום זה');
    }

    const receipt = await this.documentsService.getBillingReceiptPdf(event.receiptDocId);

    return {
      buffer: receipt.buffer,
      docType: receipt.docType,
      docNumber: receipt.docNumber,
      generalDocIndex: receipt.generalDocIndex,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async buildBillingStateResponse(
    subscription: Subscription,
    plan: SubscriptionPlan | null,
    firebaseId: string,
  ) {
    const modulesAccess = this.subscriptionAccessService.resolveModulesAccess(
      subscription,
      plan,
    );

    const [billingPaymentResult, billingBusinessType, paymentMethod] = await Promise.all([
      this.buildPaymentResultPayload(firebaseId),
      this.pricingService.resolveUserBillingBusinessType(firebaseId),
      subscription.paymentMethodId
        ? this.paymentMethodRepo.findOne({ where: { id: subscription.paymentMethodId } })
        : Promise.resolve(null),
    ]);

    // Monthly plan price effective for the user's billing business type, BEFORE
    // VAT — exactly the value stored in subscription_plan (price_monthly_agorot
    // for EXEMPT, licensed_dealer_price_monthly_agorot for LICENSED when set).
    // Resolved on the backend so the frontend never chooses between exempt/
    // licensed pricing, and never adds VAT for display. Any active discount is
    // reported separately in `discount` — it is NOT subtracted here.
    const effectiveMonthlyPriceBeforeVatAgorot = plan
      ? this.pricingService.resolveEffectivePlanPrice(plan, billingBusinessType)
      : null;

    const discount = this.pricingService.resolveSubscriptionDiscount(subscription);

    return {
      hasSubscription: true,
      billingBusinessType,
      effectiveMonthlyPriceBeforeVatAgorot,
      discount,
      // No cardholder-name column on payment_method — omitted by design (Phase 1).
      paymentMethod: paymentMethod
        ? {
            brand: paymentMethod.cardBrand,
            last4: paymentMethod.last4,
            expiryMonth: paymentMethod.cardExpiryMonth,
            expiryYear: paymentMethod.cardExpiryYear,
            createdAt: paymentMethod.createdAt,
            updatedAt: paymentMethod.updatedAt,
          }
        : null,
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
      billingPaymentResult,
    };
  }

  /**
   * Builds the latest CardCom payment/invoice outcome for the frontend's
   * post-return-from-CardCom UI (success / email-failed / invoice-failed /
   * failed / activation-failed / processing).
   *
   * Returns null when there is no PAYMENT_SUCCESS/PAYMENT_FAILED event AND no
   * failed webhook-processing attempt for this user — the frontend treats that
   * as "still processing" right after a redirect, bounded by its own timeout.
   *
   * ACTIVATION_FAILED covers the case where CardCom's charge was independently
   * verified (GetLpResult) but our own post-payment logic then failed — e.g.
   * subscription row not found, firebaseId mismatch, or a DB/transaction error
   * while activating. These are real charges that must never be reported to the
   * user as "payment failed" (see CardcomWebhookService.processVerifiedSuccess).
   * We surface the most recent of {payment event, failed webhook log} by time,
   * since a later successful retry should always take precedence over an older
   * failure.
   */
  private async buildPaymentResultPayload(firebaseId: string): Promise<{
    latestPaymentEventId: number | null;
    paymentStatus: 'SUCCESS' | 'FAILED' | 'ACTIVATION_FAILED';
    receiptDocId: number | null;
    receiptEmailSent: boolean | null;
    receiptEmail: string | null;
    receiptFailed: boolean;
    failureReason: string | null;
    createdAt: Date;
  } | null> {
    const event = await this.billingEventService.findLatestPaymentResultEvent(firebaseId);
    const failedLog = await this.webhookLogRepo.findOne({
      where: { firebaseId, status: WebhookLogStatus.FAILED },
      order: { createdAt: 'DESC' },
    });

    const eventTime = event?.createdAt?.getTime() ?? -Infinity;
    const failedLogTime = failedLog?.createdAt?.getTime() ?? -Infinity;

    if (failedLog && failedLogTime > eventTime) {
      return {
        latestPaymentEventId: null,
        paymentStatus: 'ACTIVATION_FAILED',
        receiptDocId: null,
        receiptEmailSent: null,
        receiptEmail: null,
        receiptFailed: false,
        failureReason: failedLog.errorMessage,
        createdAt: failedLog.createdAt,
      };
    }

    if (!event) return null;

    const isSuccess = event.eventType === BillingEventType.PAYMENT_SUCCESS;

    let receiptEmail: string | null = null;
    let receiptFailed = false;
    if (isSuccess) {
      const user = await this.userRepo.findOne({ where: { firebaseId } });
      receiptEmail = user?.email ?? null;
      if (event.receiptDocId == null && event.subscriptionId != null) {
        receiptFailed = await this.billingEventService.hasReceiptFailedAfter(
          event.subscriptionId,
          event.createdAt,
        );
      }
    }

    return {
      latestPaymentEventId: event.id,
      paymentStatus: isSuccess ? 'SUCCESS' : 'FAILED',
      receiptDocId: isSuccess ? event.receiptDocId : null,
      receiptEmailSent: isSuccess ? event.receiptEmailSent : null,
      receiptEmail,
      receiptFailed,
      failureReason: !isSuccess ? ((event.metadata?.reason as string) ?? null) : null,
      createdAt: event.createdAt,
    };
  }

  /**
   * Evaluates and enforces subscription lifecycle transitions.
   * Persists any state changes and keeps legacy User fields in sync.
   * Evaluates and enforces subscription lifecycle transitions for a single
   * subscription, on access (e.g. when the user opens the billing page).
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
      await this.expireTrialSubscription(subscription);
    }

    return subscription;
  }

  /**
   * Daily lifecycle job: transitions every TRIAL subscription whose
   * trialEnd has passed to TRIAL_EXPIRED. Subscription.status/trialEnd is
   * the only input — no legacy User fields are read. Intended to be called
   * once a day (see AppService.handleDailyTask).
   */
  async expireOverdueTrials(): Promise<number> {
    const overdueTrials = await this.subscriptionRepo.find({
      where: {
        status: SubscriptionStatus.TRIAL,
        trialEnd: LessThan(new Date()),
      },
    });

    for (const subscription of overdueTrials) {
      await this.expireTrialSubscription(subscription);
    }

    if (overdueTrials.length > 0) {
      this.logger.log(`expireOverdueTrials: expired ${overdueTrials.length} trial subscription(s)`);
    }

    return overdueTrials.length;
  }

  /**
   * Temporary bridge: keeps legacy User fields in sync until they're
   * dropped. Best-effort — failures are logged but never break the main flow.
   */
  private async expireTrialSubscription(subscription: Subscription): Promise<void> {
    subscription.status = SubscriptionStatus.TRIAL_EXPIRED;
    await this.subscriptionRepo.save(subscription);
  }
}
