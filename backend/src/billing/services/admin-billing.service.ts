import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { User } from 'src/users/user.entity';
import { Business } from 'src/business/business.entity';
import { CreatePlanDto } from '../dtos/admin/create-plan.dto';
import { UpdatePlanDto } from '../dtos/admin/update-plan.dto';
import { UpdateSubscriptionDiscountDto } from '../dtos/admin/update-subscription-discount.dto';
import { UpdateSubscriptionTrialEndDto } from '../dtos/admin/update-subscription-trial-end.dto';
import { UpdateSubscriptionPlanDto } from '../dtos/admin/update-subscription-plan.dto';
import { UpdateSubscriptionBillingAccessModeDto } from '../dtos/admin/update-subscription-billing-access-mode.dto';
import { RenewalBatchResult, RenewalResult, SubscriptionRenewalService } from './subscription-renewal.service';
import { BillingEventService } from './billing-event.service';
import { BillingReceiptService } from './billing-receipt.service';
import { BillingIssuerConfigService } from './billing-issuer-config.service';
import { PricingService } from './pricing.service';
import { BillingAccessMode, BillingAttemptStatus, BillingEventType, SubscriptionStatus } from '../enums/billing.enums';
import {
  AdminBillingExceptionAction,
  AdminBillingExceptionFailureCategory,
  AdminUnresolvedAttemptIndicator,
  AdminUnresolvedAttemptStatus,
  AdminUnresolvedBillingAttemptResponse,
} from '../dtos/admin/admin-billing-exception.dto';
import {
  BillingPreSubmissionFailureReason,
  preSubmissionFailureCategory,
} from './billing-attempt-orchestration.service';

/** Attempts that block a subscription's obligation and need admin visibility. */
const UNRESOLVED_ATTEMPT_STATUSES: AdminUnresolvedAttemptStatus[] = [
  BillingAttemptStatus.CREATED,
  BillingAttemptStatus.AWAITING_CUSTOMER,
  BillingAttemptStatus.PROCESSING,
  BillingAttemptStatus.CAPTURED,
  BillingAttemptStatus.UNKNOWN,
  BillingAttemptStatus.MANUAL_REVIEW,
];

/** Local pre-submission failures where the customer must fix the payment method. */
const CUSTOMER_PAYMENT_METHOD_FAILURES: ReadonlySet<string> = new Set(
  [
    BillingPreSubmissionFailureReason.NO_PAYMENT_METHOD,
    BillingPreSubmissionFailureReason.NO_STORED_TOKEN,
    BillingPreSubmissionFailureReason.CARD_EXPIRY_MISSING,
    BillingPreSubmissionFailureReason.CARD_EXPIRED,
  ].map(preSubmissionFailureCategory),
);

const TOKEN_DECRYPTION_FAILURE = preSubmissionFailureCategory(
  BillingPreSubmissionFailureReason.TOKEN_DECRYPTION_FAILED,
);

/**
 * Maps the persisted `failure_category` (never returned) and status to the
 * whitelisted classification and the party that has to act. Any provider-side
 * category, however it was recorded, collapses to "still being checked"
 * (UNKNOWN) or "checks exhausted" (MANUAL_REVIEW).
 */
export function classifyUnresolvedAttempt(
  status: AdminUnresolvedAttemptStatus,
  persistedCategory: string | null,
): {
  failureCategory: AdminBillingExceptionFailureCategory;
  requiredAction: AdminBillingExceptionAction;
} {
  if (persistedCategory === 'HOSTED_CREATE_UNCERTAIN' || persistedCategory === 'HOSTED_CREATE_REJECTED') {
    return { failureCategory: 'HOSTED_CREATION_FAILED', requiredAction: 'INTERNAL_REVIEW' };
  }
  if (status === BillingAttemptStatus.CAPTURED) {
    return { failureCategory: 'POST_CAPTURE_PENDING', requiredAction: 'INTERNAL_REVIEW' };
  }
  if ([BillingAttemptStatus.CREATED, BillingAttemptStatus.AWAITING_CUSTOMER].includes(status)) {
    return { failureCategory: 'CHECKOUT_NOT_FINISHED', requiredAction: 'INTERNAL_REVIEW' };
  }
  if (persistedCategory && CUSTOMER_PAYMENT_METHOD_FAILURES.has(persistedCategory)) {
    return {
      failureCategory: 'MISSING_OR_EXPIRED_PAYMENT_METHOD',
      requiredAction: 'CUSTOMER_PAYMENT_METHOD',
    };
  }
  if (persistedCategory === TOKEN_DECRYPTION_FAILURE) {
    return { failureCategory: 'TOKEN_DECRYPTION_FAILED', requiredAction: 'INTERNAL_REVIEW' };
  }
  return [BillingAttemptStatus.MANUAL_REVIEW, BillingAttemptStatus.CAPTURED, BillingAttemptStatus.CREATED].includes(status)
    ? { failureCategory: 'RECONCILIATION_EXHAUSTED', requiredAction: 'INTERNAL_REVIEW' }
    : { failureCategory: 'PROVIDER_OUTCOME_UNKNOWN', requiredAction: 'AUTOMATIC_CHECK' };
}

export interface PendingReceiptFailure {
  billingEventId: number;
  eventType: string;
  subscriptionId: number | null;
  firebaseId: string;
  userName: string | null;
  userEmail: string | null;
  planId: number | null;
  planName: string | null;
  amountAgorot: number | null;
  cardcomDealNumber: string | null;
  createdAt: Date;
}

export interface AdminSubscriptionResponse extends AdminUnresolvedAttemptIndicator {
  subscriptionId: number;
  firebaseId: string;
  status: string;
  billingAccessMode: BillingAccessMode;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  hasOpenBanking: boolean;
  lastLoginAt: Date | null;
  businessId: number | null;
  businessName: string | null;
  planId: number | null;
  planName: string | null;
  planSlug: string | null;
  planPriceAgorot: number | null;
  /**
   * Approximation of the amount the next renewal will charge: planPriceAgorot
   * with the subscription's discount applied as of nextBillingDate. Does NOT
   * account for business-type-specific pricing (PricingService.resolveEffectivePlanPrice)
   * — the real charge amount is always computed at renewal time via
   * PricingService.calculateCheckoutPrice. This field is for admin display only.
   */
  nextBillingAmountAgorot: number | null;
  trialEnd: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  nextBillingDate: Date | null;
  gracePeriodEndsAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  cardTokenExists: boolean;
  cardLast4: string | null;
  cardBrand: string | null;
  cardExpiryMonth: number | null;
  cardExpiryYear: number | null;
  discountPercent: number | null;
  discountAmountAgorot: number | null;
  discountStartDate: Date | null;
  discountEndDate: Date | null;
}

export interface AdminSubscriptionDiscountResponse {
  subscriptionId: number;
  discountPercent: number | null;
  discountAmountAgorot: number | null;
  discountStartDate: Date | null;
  discountEndDate: Date | null;
}

export interface AdminSubscriptionTrialEndResponse {
  subscriptionId: number;
  trialEnd: Date | null;
  status: SubscriptionStatus;
}

export interface AdminSubscriptionPlanResponse {
  subscriptionId: number;
  planId: number | null;
  planName: string | null;
  planSlug: string | null;
  planPriceAgorot: number | null;
}

export interface AdminSubscriptionBillingAccessModeResponse {
  subscriptionId: number;
  billingAccessMode: BillingAccessMode;
  status: SubscriptionStatus;
  planId: number | null;
}

@Injectable()
export class AdminBillingService {
  private readonly logger = new Logger(AdminBillingService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    private readonly dataSource: DataSource,
    private readonly subscriptionRenewalService: SubscriptionRenewalService,
    private readonly billingEventService: BillingEventService,
    private readonly billingReceiptService: BillingReceiptService,
    private readonly billingIssuerConfigService: BillingIssuerConfigService,
    private readonly pricingService: PricingService,
  ) {}

  // ─── Plans ──────────────────────────────────────────────────────────────────

  /** Returns all plans regardless of isActive/isPublic, ordered by displayOrder. */
  findAllPlans(): Promise<SubscriptionPlan[]> {
    return this.planRepo.find({ order: { displayOrder: 'ASC', id: 'ASC' } });
  }

  async createPlan(dto: CreatePlanDto): Promise<SubscriptionPlan> {
    const plan = this.planRepo.create({
      ...dto,
      currency: dto.currency ?? 'ILS',
      trialDays: dto.trialDays ?? 14,
      isActive: dto.isActive ?? true,
      isPublic: dto.isPublic ?? true,
      displayOrder: dto.displayOrder ?? 0,
    });
    return this.planRepo.save(plan);
  }

  async updatePlan(id: number, dto: UpdatePlanDto): Promise<SubscriptionPlan> {
    const plan = await this.planRepo.findOneBy({ id });
    if (!plan) throw new NotFoundException(`תוכנית ${id} לא נמצאה`);
    Object.assign(plan, dto);
    return this.planRepo.save(plan);
  }

  /** Deactivates the plan by setting isActive=false. Record is kept intact. */
  async deactivatePlan(id: number): Promise<SubscriptionPlan> {
    const plan = await this.planRepo.findOneBy({ id });
    if (!plan) throw new NotFoundException(`תוכנית ${id} לא נמצאה`);
    plan.isActive = false;
    return this.planRepo.save(plan);
  }

  /** Re-activates a previously deactivated plan. */
  async activatePlan(id: number): Promise<SubscriptionPlan> {
    const plan = await this.planRepo.findOneBy({ id });
    if (!plan) throw new NotFoundException(`תוכנית ${id} לא נמצאה`);
    plan.isActive = true;
    return this.planRepo.save(plan);
  }

  // ─── Subscriptions ───────────────────────────────────────────────────────────

  async findAllSubscriptions(): Promise<AdminSubscriptionResponse[]> {
    // Q1: subscriptions + plan + payment method
    const raw: any[] = await this.dataSource
      .createQueryBuilder()
      .select('s.id',                    'subscriptionId')
      .addSelect('s.firebaseId',          'firebaseId')
      .addSelect('s.planId',              'planId')
      .addSelect('s.status',              'status')
      .addSelect('s.billingAccessMode',   'billingAccessMode')
      .addSelect('s.trialEnd',            'trialEnd')
      .addSelect('s.currentPeriodStart',  'currentPeriodStart')
      .addSelect('s.currentPeriodEnd',    'currentPeriodEnd')
      .addSelect('s.nextBillingDate',     'nextBillingDate')
      .addSelect('s.gracePeriodEndsAt',   'gracePeriodEndsAt')
      .addSelect('s.canceledAt',          'canceledAt')
      .addSelect('s.endedAt',             'endedAt')
      .addSelect('s.createdAt',           'createdAt')
      .addSelect('s.discountPercent',     'discountPercent')
      .addSelect('s.discountAmountAgorot', 'discountAmountAgorot')
      .addSelect('s.discountStartDate',   'discountStartDate')
      .addSelect('s.discountEndDate',     'discountEndDate')
      .addSelect('p.name',                'planName')
      .addSelect('p.slug',                'planSlug')
      .addSelect('p.priceMonthlyAgorot',  'planPriceAgorot')
      .addSelect('pm.last4',              'cardLast4')
      .addSelect('pm.cardBrand',          'cardBrand')
      .addSelect('pm.cardExpiryMonth',    'cardExpiryMonth')
      .addSelect('pm.cardExpiryYear',     'cardExpiryYear')
      .from(Subscription, 's')
      .leftJoin(SubscriptionPlan, 'p', 'p.id = s.planId')
      .leftJoin(PaymentMethod, 'pm', 'pm.id = s.paymentMethodId')
      .orderBy('s.createdAt', 'DESC')
      .getRawMany();

    if (raw.length === 0) return [];

    const firebaseIds = [...new Set(raw.map(r => r.firebaseId as string))].filter(Boolean);

    // Q2: users keyed by firebaseId
    const userMap = new Map<string, {
      userId: number;
      fName: string;
      lName: string;
      email: string;
      hasOpenBanking: boolean;
      lastLoginAt: Date | null;
    }>();
    if (firebaseIds.length > 0) {
      const users: any[] = await this.dataSource
        .createQueryBuilder()
        .select('u.index',      'userId')
        .addSelect('u.firebaseId', 'firebaseId')
        .addSelect('u.fName',   'fName')
        .addSelect('u.lName',   'lName')
        .addSelect('u.email',   'email')
        .addSelect('u.hasOpenBanking', 'hasOpenBanking')
        .addSelect('u.lastLoginAt', 'lastLoginAt')
        .from(User, 'u')
        .where('u.firebaseId IN (:...ids)', { ids: firebaseIds })
        .getRawMany();
      for (const u of users) userMap.set(u.firebaseId, u);
    }

    // Q3: businesses keyed by firebaseId (latest per user)
    const businessMap = new Map<string, { id: number; businessName: string | null }>();
    if (firebaseIds.length > 0) {
      const businesses: any[] = await this.dataSource
        .createQueryBuilder()
        .select('b.id',            'id')
        .addSelect('b.firebaseId', 'firebaseId')
        .addSelect('b.businessName', 'businessName')
        .from(Business, 'b')
        .where('b.firebaseId IN (:...ids)', { ids: firebaseIds })
        .orderBy('b.id', 'ASC')
        .getRawMany();
      for (const b of businesses) businessMap.set(b.firebaseId, { id: Number(b.id), businessName: b.businessName });
    }

    // Q4: one grouped query for every subscription's unresolved-attempt indicator
    const indicatorMap = await this.loadUnresolvedAttemptIndicators();

    return raw.map((r): AdminSubscriptionResponse => {
      const user = userMap.get(r.firebaseId);
      const biz  = businessMap.get(r.firebaseId);
      const sid  = Number(r.subscriptionId);
      const planPriceAgorot = r.planPriceAgorot != null ? Number(r.planPriceAgorot) : null;

      // Approximation only — see AdminSubscriptionResponse.nextBillingAmountAgorot doc comment.
      let nextBillingAmountAgorot: number | null = null;
      if (planPriceAgorot != null && r.nextBillingDate) {
        const nextBillingDateString = new Date(r.nextBillingDate).toISOString().slice(0, 10);
        nextBillingAmountAgorot = this.pricingService.applySubscriptionDiscount(
          planPriceAgorot,
          {
            discountPercent: r.discountPercent != null ? Number(r.discountPercent) : null,
            discountAmountAgorot: r.discountAmountAgorot != null ? Number(r.discountAmountAgorot) : null,
            discountStartDate: r.discountStartDate ?? null,
            discountEndDate: r.discountEndDate ?? null,
          },
          nextBillingDateString,
        ).finalAmountAgorot;
      }

      return {
        subscriptionId:     sid,
        firebaseId:         r.firebaseId,
        status:             r.status,
        billingAccessMode:  r.billingAccessMode,
        userId:             user ? Number(user.userId) : null,
        userName:           user ? `${user.fName ?? ''} ${user.lName ?? ''}`.trim() || null : null,
        userEmail:          user?.email ?? null,
        hasOpenBanking:     Number(user?.hasOpenBanking ?? 0) === 1,
        lastLoginAt:        user?.lastLoginAt ?? null,
        businessId:         biz ? Number(biz.id) : null,
        businessName:       biz?.businessName ?? null,
        planId:             r.planId != null ? Number(r.planId) : null,
        planName:           r.planName ?? null,
        planSlug:           r.planSlug ?? null,
        planPriceAgorot,
        nextBillingAmountAgorot,
        trialEnd:           r.trialEnd ?? null,
        currentPeriodStart: r.currentPeriodStart ?? null,
        currentPeriodEnd:   r.currentPeriodEnd ?? null,
        nextBillingDate:    r.nextBillingDate ?? null,
        gracePeriodEndsAt:  r.gracePeriodEndsAt ?? null,
        canceledAt:         r.canceledAt ?? null,
        endedAt:            r.endedAt ?? null,
        createdAt:          r.createdAt,
        cardTokenExists:    r.cardLast4 != null,
        cardLast4:          r.cardLast4 ?? null,
        cardBrand:          r.cardBrand ?? null,
        cardExpiryMonth:    r.cardExpiryMonth != null ? Number(r.cardExpiryMonth) : null,
        cardExpiryYear:     r.cardExpiryYear != null ? Number(r.cardExpiryYear) : null,
        discountPercent:      r.discountPercent != null ? Number(r.discountPercent) : null,
        discountAmountAgorot: r.discountAmountAgorot != null ? Number(r.discountAmountAgorot) : null,
        discountStartDate:    r.discountStartDate ?? null,
        discountEndDate:      r.discountEndDate ?? null,
        unresolvedBillingAttemptCount: indicatorMap.get(sid)?.count ?? 0,
        mostSevereUnresolvedAttemptStatus: indicatorMap.get(sid)?.mostSevere ?? null,
      };
    });
  }

  /**
   * Compact, read-only table indicator: unresolved (UNKNOWN / MANUAL_REVIEW)
   * attempt count per subscription in a single grouped query, so the list never
   * costs one query per row. It is an advisory badge, so a failure here (for
   * example billing tables not yet migrated) must not take down the whole admin
   * list; it is logged and the badge is simply omitted.
   */
  private async loadUnresolvedAttemptIndicators(): Promise<
    Map<number, { count: number; mostSevere: AdminUnresolvedAttemptStatus }>
  > {
    const indicators = new Map<number, { count: number; mostSevere: AdminUnresolvedAttemptStatus }>();
    try {
      const rows: any[] = await this.dataSource
        .createQueryBuilder()
        .select('o.subscriptionId', 'subscriptionId')
        .addSelect('COUNT(a.id)', 'unresolvedCount')
        .addSelect('SUM(CASE WHEN a.status = :manualReview THEN 1 ELSE 0 END)', 'manualReviewCount')
        .addSelect("MAX(FIELD(a.status, 'AWAITING_CUSTOMER', 'CREATED', 'PROCESSING', 'CAPTURED', 'UNKNOWN', 'MANUAL_REVIEW'))", 'statusRank')
        .from(BillingAttempt, 'a')
        .innerJoin(BillingObligation, 'o', 'o.id = a.obligationId')
        .where('a.status IN (:...unresolved)', { unresolved: UNRESOLVED_ATTEMPT_STATUSES })
        .setParameter('manualReview', BillingAttemptStatus.MANUAL_REVIEW)
        .groupBy('o.subscriptionId')
        .getRawMany();
      for (const row of rows) {
        indicators.set(Number(row.subscriptionId), {
          count: Number(row.unresolvedCount),
          mostSevere:
            Number(row.manualReviewCount) > 0
              ? BillingAttemptStatus.MANUAL_REVIEW
              : ([BillingAttemptStatus.AWAITING_CUSTOMER, BillingAttemptStatus.CREATED,
                  BillingAttemptStatus.PROCESSING, BillingAttemptStatus.CAPTURED, BillingAttemptStatus.UNKNOWN,
                  BillingAttemptStatus.MANUAL_REVIEW][Number(row.statusRank) - 1] ?? BillingAttemptStatus.UNKNOWN),
        });
      }
    } catch (error) {
      this.logger.warn(
        `Unresolved billing attempt indicators unavailable: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
    return indicators;
  }

  /**
   * Read-only detail for the subscription drawer: this subscription's
   * unresolved (UNKNOWN / MANUAL_REVIEW) attempts, newest first, as sanitized
   * DTOs. Columns are selected explicitly, so no token, credential, provider
   * response or exception text can reach the response, and nothing is mutated.
   */
  async findUnresolvedBillingAttempts(
    subscriptionId: number,
  ): Promise<AdminUnresolvedBillingAttemptResponse[]> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId },
      select: { id: true },
    });
    if (!subscription) throw new NotFoundException(`מנוי ${subscriptionId} לא נמצא`);

    const rows: any[] = await this.dataSource
      .createQueryBuilder()
      .select('a.id', 'attemptId')
      .addSelect('a.stateVersion', 'stateVersion')
      .addSelect('a.status', 'status')
      .addSelect('a.chargeMode', 'chargeMode')
      .addSelect('a.amountAgorot', 'amountAgorot')
      .addSelect('a.currency', 'currency')
      .addSelect('a.createdAt', 'createdAt')
      .addSelect('a.capturedAt', 'capturedAt')
      .addSelect('a.unknownSince', 'unknownSince')
      .addSelect('a.reconciliationAttempts', 'reconciliationAttempts')
      .addSelect('a.lastReconciledAt', 'lastReconciledAt')
      .addSelect('a.nextActionAt', 'nextActionAt')
      .addSelect('a.failureCategory', 'failureCategory')
      .addSelect('a.cardcomTransactionId', 'cardcomTransactionId')
      .addSelect('a.cardcomLowProfileId', 'cardcomLowProfileId')
      .from(BillingAttempt, 'a')
      .innerJoin(BillingObligation, 'o', 'o.id = a.obligationId')
      .where('o.subscriptionId = :subscriptionId', { subscriptionId })
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .getRawMany();

    if (rows.length === 0) return [];

    // One lookup for all attempts; only a boolean is derived from event metadata.
    const attemptIds = rows.map(r => Number(r.attemptId));
    const events: any[] = await this.dataSource
      .createQueryBuilder()
      .select('e.billingAttemptId', 'billingAttemptId')
      .addSelect('e.metadata', 'metadata')
      .addSelect('e.createdAt', 'createdAt')
      .from(BillingEvent, 'e')
      .where('e.billingAttemptId IN (:...attemptIds)', { attemptIds })
      .orderBy('e.id', 'ASC')
      .getRawMany();
    const tokenRecovered = new Set<number>();
    const resolutions = new Map<number, AdminUnresolvedBillingAttemptResponse['lastResolution']>();
    for (const event of events) {
      const metadata = typeof event.metadata === 'string' ? safeParseObject(event.metadata) : event.metadata;
      if (metadata?.cardTokenStored === true) tokenRecovered.add(Number(event.billingAttemptId));
      if (metadata?.kind === 'ADMIN_BILLING_RESOLUTION' &&
        ['CHECK_PROVIDER', 'CONFIRM_NO_CHARGE', 'COMPLETE_CAPTURED'].includes(metadata.action)) {
        resolutions.set(Number(event.billingAttemptId), { action: metadata.action,
          evidence: String(metadata.evidence ?? ''), actorFirebaseId: String(metadata.actorFirebaseId ?? ''),
          createdAt: event.createdAt });
      }
    }

    return rows.map((r): AdminUnresolvedBillingAttemptResponse => {
      const status = r.status as AdminUnresolvedAttemptStatus;
      const { failureCategory, requiredAction } = classifyUnresolvedAttempt(
        status,
        r.failureCategory ?? null,
      );
      return {
        attemptId: Number(r.attemptId),
        stateVersion: Number(r.stateVersion ?? 0),
        ...(resolutions.has(Number(r.attemptId)) ? { lastResolution: resolutions.get(Number(r.attemptId)) } : {}),
        status,
        chargeMode: r.chargeMode,
        amountAgorot: Number(r.amountAgorot),
        currency: r.currency,
        createdAt: r.createdAt,
        capturedAt: r.capturedAt ?? null,
        unknownSince: r.unknownSince ?? null,
        reconciliationAttempts: Number(r.reconciliationAttempts),
        lastReconciledAt: r.lastReconciledAt ?? null,
        nextActionAt: r.nextActionAt ?? null,
        failureCategory,
        requiredAction,
        cardcomTransactionId: r.cardcomTransactionId ?? null,
        cardcomLowProfileId: r.cardcomLowProfileId ?? null,
        cardTokenRecovered: tokenRecovered.has(Number(r.attemptId)),
      };
    });
  }

  /**
   * Updates the per-subscription discount fields. Enforces:
   *  - discountPercent and discountAmountAgorot are mutually exclusive
   *  - discountPercent in [0, 100]  (also enforced by DTO)
   *  - discountAmountAgorot >= 0    (also enforced by DTO)
   *  - discountStartDate <= discountEndDate when both are set
   */
  async updateSubscriptionDiscount(
    subscriptionId: number,
    dto: UpdateSubscriptionDiscountDto,
  ): Promise<AdminSubscriptionDiscountResponse> {
    const subscription = await this.subscriptionRepo.findOneBy({ id: subscriptionId });
    if (!subscription) throw new NotFoundException(`מנוי ${subscriptionId} לא נמצא`);

    const nextPercent = dto.discountPercent !== undefined ? dto.discountPercent : subscription.discountPercent;
    const nextAmount = dto.discountAmountAgorot !== undefined ? dto.discountAmountAgorot : subscription.discountAmountAgorot;
    const nextStart = dto.discountStartDate !== undefined
      ? (dto.discountStartDate ? new Date(dto.discountStartDate) : null)
      : subscription.discountStartDate;
    const nextEnd = dto.discountEndDate !== undefined
      ? (dto.discountEndDate ? new Date(dto.discountEndDate) : null)
      : subscription.discountEndDate;

    if (nextPercent != null && nextAmount != null) {
      throw new BadRequestException('ניתן להגדיר אחוז הנחה או סכום הנחה, לא את שניהם');
    }
    if (nextStart != null && nextEnd != null && nextStart > nextEnd) {
      throw new BadRequestException('תאריך התחלת ההנחה חייב להיות לפני או שווה לתאריך הסיום');
    }

    const discountPercent = nextPercent ?? null;
    const discountAmountAgorot = nextAmount ?? null;
    const discountStartDate = nextStart ?? null;
    const discountEndDate = nextEnd ?? null;

    // A narrow UPDATE prevents a stale entity loaded before an access-mode
    // change from writing STANDARD back over COMPLIMENTARY_FULL.
    await this.subscriptionRepo.update(subscription.id, {
      discountPercent,
      discountAmountAgorot,
      discountStartDate,
      discountEndDate,
    });

    return {
      subscriptionId: subscription.id,
      discountPercent,
      discountAmountAgorot,
      discountStartDate,
      discountEndDate,
    };
  }

  /**
   * Admin override of trialEnd, editable from the admin subscriptions drawer.
   * A future date restores only an expired trial. The row lock keeps the date
   * and status decision atomic without touching paid-billing fields.
   */
  async updateSubscriptionTrialEnd(
    subscriptionId: number,
    dto: UpdateSubscriptionTrialEndDto,
  ): Promise<AdminSubscriptionTrialEndResponse> {
    return this.dataSource.transaction(async manager => {
      const subscription = await manager.findOne(Subscription, {
        where: { id: subscriptionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!subscription) throw new NotFoundException(`מנוי ${subscriptionId} לא נמצא`);

      const trialEnd = dto.trialEnd ? new Date(dto.trialEnd) : null;
      const restoresExpiredTrial =
        subscription.status === SubscriptionStatus.TRIAL_EXPIRED &&
        trialEnd !== null &&
        trialEnd > new Date();

      await manager.update(
        Subscription,
        subscription.id,
        restoresExpiredTrial
          ? { trialEnd, status: SubscriptionStatus.TRIAL }
          : { trialEnd },
      );

      return {
        subscriptionId: subscription.id,
        trialEnd,
        status: restoresExpiredTrial ? SubscriptionStatus.TRIAL : subscription.status,
      };
    });
  }

  /**
   * Admin override of a subscription's plan, editable inline from the admin
   * subscriptions table. Only updates the FK — see UpdateSubscriptionPlanDto.
   */
  async updateSubscriptionPlan(
    subscriptionId: number,
    dto: UpdateSubscriptionPlanDto,
  ): Promise<AdminSubscriptionPlanResponse> {
    let plan: SubscriptionPlan | null = null;
    if (dto.planId != null) {
      plan = await this.planRepo.findOneBy({ id: dto.planId });
      if (!plan) throw new NotFoundException(`תוכנית ${dto.planId} לא נמצאה`);
    }

    await this.dataSource.transaction(async manager => {
      const subscription = await manager.findOne(Subscription, {
        where: { id: subscriptionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!subscription) throw new NotFoundException(`מנוי ${subscriptionId} לא נמצא`);
      if (subscription.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL) {
        throw new BadRequestException('לא ניתן לשייך תוכנית למשתמש עם גישה מלאה ללא חיוב');
      }

      await manager.update(Subscription, subscription.id, { planId: dto.planId ?? null });
    });

    return {
      subscriptionId,
      planId: dto.planId ?? null,
      planName: plan?.name ?? null,
      planSlug: plan?.slug ?? null,
      planPriceAgorot: plan?.priceMonthlyAgorot ?? null,
    };
  }

  /**
   * Grants or revokes the explicit no-charge entitlement. Granting removes the
   * plan and all future charge scheduling. Revocation never charges: it leaves
   * the user in TRIAL_EXPIRED until an ordinary plan/payment flow is chosen.
   */
  async updateSubscriptionBillingAccessMode(
    subscriptionId: number,
    dto: UpdateSubscriptionBillingAccessModeDto,
    actorFirebaseId: string,
  ): Promise<AdminSubscriptionBillingAccessModeResponse> {
    const result = await this.dataSource.transaction(async manager => {
      const subscription = await manager.findOne(Subscription, {
        where: { id: subscriptionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!subscription) throw new NotFoundException(`מנוי ${subscriptionId} לא נמצא`);

      const previousMode = subscription.billingAccessMode;
      if (previousMode === dto.billingAccessMode) {
        return { subscription, previousMode, changed: false };
      }

      subscription.billingAccessMode = dto.billingAccessMode;
      subscription.planId = null;
      subscription.nextBillingDate = null;
      subscription.gracePeriodEndsAt = null;
      subscription.renewalAttempts = 0;

      if (dto.billingAccessMode === BillingAccessMode.STANDARD) {
        subscription.status = SubscriptionStatus.TRIAL_EXPIRED;
      }

      // Deliberately write an explicit partial update. This is the sole path
      // allowed to change billingAccessMode; every unrelated mutation updates
      // only its own columns so a stale entity cannot revoke the exemption.
      await manager.update(Subscription, subscription.id, {
        billingAccessMode: subscription.billingAccessMode,
        planId: subscription.planId,
        nextBillingDate: subscription.nextBillingDate,
        gracePeriodEndsAt: subscription.gracePeriodEndsAt,
        renewalAttempts: subscription.renewalAttempts,
        status: subscription.status,
      });
      return { subscription, previousMode, changed: true };
    });

    if (result.changed) {
      await this.billingEventService.logEvent({
        firebaseId: result.subscription.firebaseId,
        subscriptionId: result.subscription.id,
        eventType:
          dto.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL
            ? BillingEventType.BILLING_EXEMPTION_GRANTED
            : BillingEventType.BILLING_EXEMPTION_REVOKED,
        metadata: {
          actorFirebaseId,
          previousMode: result.previousMode,
          newMode: dto.billingAccessMode,
          reason: dto.reason?.trim() || null,
        },
      });
    }

    return {
      subscriptionId: result.subscription.id,
      billingAccessMode: result.subscription.billingAccessMode,
      status: result.subscription.status,
      planId: result.subscription.planId,
    };
  }

  // ─── Renewal (manual trigger, for testing) ───────────────────────────────────

  /**
   * Manually runs the renewal flow for a single subscription, bypassing the
   * daily cron schedule. Same row-lock + idempotency guarantees as the cron —
   * safe to call on a subscription that isn't actually due (it will just be
   * skipped) or one already being processed by the cron concurrently.
   */
  async triggerSubscriptionRenewal(subscriptionId: number): Promise<RenewalResult> {
    const subscription = await this.subscriptionRepo.findOneBy({ id: subscriptionId });
    if (!subscription) throw new NotFoundException(`מנוי ${subscriptionId} לא נמצא`);

    return this.subscriptionRenewalService.processSubscriptionById(subscriptionId);
  }

  /**
   * Manually runs the exact same daily-cron batch logic on demand — finds every
   * subscription with status=ACTIVE AND nextBillingDate<=NOW() and processes it
   * through processDueRenewals(). Same row-lock, idempotency, retry policy and
   * CardCom charge behavior as the scheduled cron — this calls the identical
   * method, not a parallel implementation.
   */
  async triggerDueRenewalsRun(): Promise<RenewalBatchResult> {
    return this.subscriptionRenewalService.processDueRenewals();
  }

  // ─── Receipt failures (manual resolution) ────────────────────────────────────

  /**
   * Lists every successful charge (PAYMENT_SUCCESS / RENEWAL_SUCCESS) that
   * still has no receiptDocId — i.e. receipt generation failed and was never
   * resolved. A subscription with one of these is blocked from further
   * payments (see BillingEventService.getUnresolvedReceiptFailure) until an
   * admin generates the receipt via generateReceiptForEvent().
   */
  async findPendingReceiptFailures(): Promise<PendingReceiptFailure[]> {
    const raw: any[] = await this.dataSource
      .createQueryBuilder()
      .select('e.id', 'billingEventId')
      .addSelect('e.eventType', 'eventType')
      .addSelect('e.subscriptionId', 'subscriptionId')
      .addSelect('e.firebaseId', 'firebaseId')
      .addSelect('e.amountAgorot', 'amountAgorot')
      .addSelect('e.cardcomDealNumber', 'cardcomDealNumber')
      .addSelect('e.createdAt', 'createdAt')
      .addSelect('s.planId', 'planId')
      .addSelect('p.name', 'planName')
      .from('billing_event', 'e')
      .leftJoin(Subscription, 's', 's.id = e.subscriptionId')
      .leftJoin(SubscriptionPlan, 'p', 'p.id = s.planId')
      .where('e.eventType IN (:...types)', {
        types: [BillingEventType.PAYMENT_SUCCESS, BillingEventType.RENEWAL_SUCCESS],
      })
      .andWhere('e.receiptDocId IS NULL')
      .orderBy('e.createdAt', 'DESC')
      .getRawMany();

    if (raw.length === 0) return [];

    const firebaseIds = [...new Set(raw.map((r) => r.firebaseId as string))].filter(Boolean);
    const userMap = new Map<string, { fName: string; lName: string; email: string }>();
    if (firebaseIds.length > 0) {
      const users: any[] = await this.dataSource
        .createQueryBuilder()
        .select('u.firebaseId', 'firebaseId')
        .addSelect('u.fName', 'fName')
        .addSelect('u.lName', 'lName')
        .addSelect('u.email', 'email')
        .from(User, 'u')
        .where('u.firebaseId IN (:...ids)', { ids: firebaseIds })
        .getRawMany();
      for (const u of users) userMap.set(u.firebaseId, u);
    }

    return raw.map((r): PendingReceiptFailure => {
      const user = userMap.get(r.firebaseId);
      return {
        billingEventId: Number(r.billingEventId),
        eventType: r.eventType,
        subscriptionId: r.subscriptionId != null ? Number(r.subscriptionId) : null,
        firebaseId: r.firebaseId,
        userName: user ? `${user.fName ?? ''} ${user.lName ?? ''}`.trim() || null : null,
        userEmail: user?.email ?? null,
        planId: r.planId != null ? Number(r.planId) : null,
        planName: r.planName ?? null,
        amountAgorot: r.amountAgorot != null ? Number(r.amountAgorot) : null,
        cardcomDealNumber: r.cardcomDealNumber ?? null,
        createdAt: r.createdAt,
      };
    });
  }

  /**
   * Manually creates the receipt for a successful charge whose automatic
   * receipt generation failed — the exact same three-step pipeline
   * (createReceiptForPayment → finalizeBillingReceiptPdfs →
   * sendReceiptEmailForPaymentEvent) that both CardcomWebhookService and
   * SubscriptionRenewalService use automatically, just triggered by hand.
   * On success, receiptDocId is set on the event, which is what
   * BillingEventService.getUnresolvedReceiptFailure checks — so the
   * subscription is immediately un-blocked from further payments too.
   */
  async generateReceiptForEvent(billingEventId: number): Promise<{ receiptDocId: number; docNumber: string }> {
    const event = await this.billingEventService.findPaymentEventById(billingEventId);
    if (!event) throw new NotFoundException(`אירוע חיוב ${billingEventId} לא נמצא`);

    if (
      event.eventType !== BillingEventType.PAYMENT_SUCCESS &&
      event.eventType !== BillingEventType.RENEWAL_SUCCESS
    ) {
      throw new BadRequestException('ניתן להפיק קבלה רק עבור אירוע PAYMENT_SUCCESS או RENEWAL_SUCCESS');
    }
    if (event.receiptDocId != null) {
      throw new BadRequestException(`כבר קיימת קבלה (docId=${event.receiptDocId}) עבור אירוע זה`);
    }
    if (event.subscriptionId == null) {
      throw new BadRequestException('לאירוע זה אין מנוי משויך');
    }
    if (event.amountBeforeVatAgorot == null || event.vatAmountAgorot == null || event.amountAgorot == null) {
      throw new BadRequestException('לאירוע זה חסר פירוט מע"מ — לא ניתן להפיק קבלה');
    }

    const subscription = await this.subscriptionRepo.findOneBy({ id: event.subscriptionId });
    if (!subscription) throw new NotFoundException(`מנוי ${event.subscriptionId} לא נמצא`);

    const plan = subscription.planId ? await this.planRepo.findOneBy({ id: subscription.planId }) : null;
    if (!plan) throw new BadRequestException('לא נמצאה תוכנית עבור המנוי — לא ניתן להפיק קבלה');

    const issuer = await this.billingIssuerConfigService.getKeepintaxIssuer();

    const receipt = await this.billingReceiptService.createReceiptForPayment(issuer, {
      firebaseId: event.firebaseId,
      subscriptionId: event.subscriptionId,
      amountBeforeVatAgorot: event.amountBeforeVatAgorot,
      vatAmountAgorot: event.vatAmountAgorot,
      amountIncludingVatAgorot: event.amountAgorot,
      planName: plan.name,
      periodStart: subscription.currentPeriodStart ?? new Date(),
      periodEnd: subscription.currentPeriodEnd ?? new Date(),
      cardcomDealNumber: event.cardcomDealNumber,
      // Attempt-keyed when the event belongs to a canonical attempt, so a manual
      // receipt and the automatic post-capture retry can never both issue one.
      billingAttemptId: event.billingAttemptId ?? null,
    });

    await this.billingEventService.updatePaymentEventWithReceipt(event.id, receipt.receiptDocId);
    await this.billingReceiptService.finalizeBillingReceiptPdfs(receipt.receiptDocId, issuer, event.firebaseId);
    await this.billingReceiptService.sendReceiptEmailForPaymentEvent(event.id, issuer.issuerName);

    return { receiptDocId: receipt.receiptDocId, docNumber: receipt.docNumber };
  }
}

function safeParseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
