import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { User } from 'src/users/user.entity';
import { Business } from 'src/business/business.entity';
import { CreatePlanDto } from '../dtos/admin/create-plan.dto';
import { UpdatePlanDto } from '../dtos/admin/update-plan.dto';
import { UpdateSubscriptionDiscountDto } from '../dtos/admin/update-subscription-discount.dto';
import { RenewalBatchResult, RenewalResult, SubscriptionRenewalService } from './subscription-renewal.service';
import { BillingEventService } from './billing-event.service';
import { BillingReceiptService } from './billing-receipt.service';
import { BillingIssuerConfigService } from './billing-issuer-config.service';
import { BillingEventType } from '../enums/billing.enums';

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

export interface AdminSubscriptionResponse {
  subscriptionId: number;
  firebaseId: string;
  status: string;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  businessId: number | null;
  businessName: string | null;
  planId: number | null;
  planName: string | null;
  planSlug: string | null;
  planPriceAgorot: number | null;
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

@Injectable()
export class AdminBillingService {
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
    const userMap = new Map<string, { userId: number; fName: string; lName: string; email: string }>();
    if (firebaseIds.length > 0) {
      const users: any[] = await this.dataSource
        .createQueryBuilder()
        .select('u.index',      'userId')
        .addSelect('u.firebaseId', 'firebaseId')
        .addSelect('u.fName',   'fName')
        .addSelect('u.lName',   'lName')
        .addSelect('u.email',   'email')
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

    return raw.map((r): AdminSubscriptionResponse => {
      const user = userMap.get(r.firebaseId);
      const biz  = businessMap.get(r.firebaseId);
      const sid  = Number(r.subscriptionId);
      return {
        subscriptionId:     sid,
        firebaseId:         r.firebaseId,
        status:             r.status,
        userId:             user ? Number(user.userId) : null,
        userName:           user ? `${user.fName ?? ''} ${user.lName ?? ''}`.trim() || null : null,
        userEmail:          user?.email ?? null,
        businessId:         biz ? Number(biz.id) : null,
        businessName:       biz?.businessName ?? null,
        planId:             r.planId != null ? Number(r.planId) : null,
        planName:           r.planName ?? null,
        planSlug:           r.planSlug ?? null,
        planPriceAgorot:    r.planPriceAgorot != null ? Number(r.planPriceAgorot) : null,
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

    subscription.discountPercent = nextPercent ?? null;
    subscription.discountAmountAgorot = nextAmount ?? null;
    subscription.discountStartDate = nextStart ?? null;
    subscription.discountEndDate = nextEnd ?? null;

    await this.subscriptionRepo.save(subscription);

    return {
      subscriptionId: subscription.id,
      discountPercent: subscription.discountPercent,
      discountAmountAgorot: subscription.discountAmountAgorot,
      discountStartDate: subscription.discountStartDate,
      discountEndDate: subscription.discountEndDate,
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
      cardcomDealNumber: event.cardcomDealNumber,
    });

    await this.billingEventService.updatePaymentEventWithReceipt(event.id, receipt.receiptDocId);
    await this.billingReceiptService.finalizeBillingReceiptPdfs(receipt.receiptDocId, issuer, event.firebaseId);
    await this.billingReceiptService.sendReceiptEmailForPaymentEvent(event.id, issuer.issuerName);

    return { receiptDocId: receipt.receiptDocId, docNumber: receipt.docNumber };
  }
}
