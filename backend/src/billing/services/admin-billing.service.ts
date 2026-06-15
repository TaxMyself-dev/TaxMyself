import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Promotion } from '../entities/promotion.entity';
import { PromotionPlan } from '../entities/promotion-plan.entity';
import { Coupon } from '../entities/coupon.entity';
import { CouponPlan } from '../entities/coupon-plan.entity';
import { CouponRedemption } from '../entities/coupon-redemption.entity';
import { User } from 'src/users/user.entity';
import { Business } from 'src/business/business.entity';
import { CreatePlanDto } from '../dtos/admin/create-plan.dto';
import { UpdatePlanDto } from '../dtos/admin/update-plan.dto';
import { CreatePromotionDto } from '../dtos/admin/create-promotion.dto';
import { UpdatePromotionDto } from '../dtos/admin/update-promotion.dto';
import { CreateCouponDto } from '../dtos/admin/create-coupon.dto';
import { UpdateCouponDto } from '../dtos/admin/update-coupon.dto';
import { UpdateSubscriptionDiscountDto } from '../dtos/admin/update-subscription-discount.dto';

export interface AdminCouponResponse {
  id: number;
  code: string;
  name: string;
  description: string | null;
  discountType: string;
  discountPercent: number | null;
  discountValueAgorot: number | null;
  durationType: string;
  durationMonths: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  currentRedemptions: number;
  maxRedemptionsPerUser: number;
  isActive: boolean;
  appliesToPlanIds: number[];
  createdAt: Date;
  updatedAt: Date;
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
  couponCode: string | null;
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

export interface AdminPromotionResponse {
  id: number;
  name: string;
  description: string | null;
  discountType: string;
  discountPercent: number | null;
  discountValueAgorot: number | null;
  durationType: string;
  durationMonths: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  priority: number;
  maxRedemptions: number | null;
  currentRedemptions: number;
  isActive: boolean;
  appliesToPlanIds: number[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AdminBillingService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Promotion)
    private readonly promotionRepo: Repository<Promotion>,
    @InjectRepository(PromotionPlan)
    private readonly promotionPlanRepo: Repository<PromotionPlan>,
    @InjectRepository(Coupon)
    private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(CouponPlan)
    private readonly couponPlanRepo: Repository<CouponPlan>,
    private readonly dataSource: DataSource,
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
    // Q1: subscriptions + plan + payment method (all billing entities with explicit column names)
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
      // Keep the last-seen (highest id) per firebaseId
      for (const b of businesses) businessMap.set(b.firebaseId, { id: Number(b.id), businessName: b.businessName });
    }

    // Q4: latest coupon code per subscription
    const subIds = raw.map(r => Number(r.subscriptionId));
    const couponMap = new Map<number, string>();
    if (subIds.length > 0) {
      const redemptions: any[] = await this.dataSource
        .createQueryBuilder()
        .select('cr.subscriptionId', 'subscriptionId')
        .addSelect('c.code',         'couponCode')
        .from(CouponRedemption, 'cr')
        .innerJoin(Coupon, 'c', 'c.id = cr.couponId')
        .where('cr.subscriptionId IN (:...ids)', { ids: subIds })
        .orderBy('cr.id', 'DESC')
        .getRawMany();
      for (const row of redemptions) {
        const sid = Number(row.subscriptionId);
        if (!couponMap.has(sid)) couponMap.set(sid, row.couponCode);
      }
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
        couponCode:         couponMap.get(sid) ?? null,
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

  // ─── Promotions ─────────────────────────────────────────────────────────────

  async findAllPromotions(): Promise<AdminPromotionResponse[]> {
    const promotions = await this.promotionRepo.find({
      order: { priority: 'DESC', id: 'ASC' },
    });
    return Promise.all(promotions.map(p => this.toPromotionResponse(p)));
  }

  async createPromotion(dto: CreatePromotionDto): Promise<AdminPromotionResponse> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const promotion = manager.create(Promotion, {
        name: dto.name,
        description: dto.description ?? null,
        discountType: dto.discountType,
        discountPercent: dto.discountPercent ?? null,
        discountValueAgorot: dto.discountValueAgorot ?? null,
        durationType: dto.durationType,
        durationMonths: dto.durationMonths ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        priority: dto.priority ?? 0,
        maxRedemptions: dto.maxRedemptions ?? null,
        isActive: dto.isActive ?? true,
      });
      const p = await manager.save(Promotion, promotion);
      await this.syncPromotionPlansInTx(manager, p.id, dto.appliesToPlanIds ?? []);
      return p;
    });
    return this.toPromotionResponse(saved);
  }

  async updatePromotion(id: number, dto: UpdatePromotionDto): Promise<AdminPromotionResponse> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const promotion = await manager.findOneBy(Promotion, { id });
      if (!promotion) throw new NotFoundException(`מבצע ${id} לא נמצא`);

      if (dto.name !== undefined) promotion.name = dto.name;
      if (dto.description !== undefined) promotion.description = dto.description ?? null;
      if (dto.discountType !== undefined) promotion.discountType = dto.discountType;
      if (dto.discountPercent !== undefined) promotion.discountPercent = dto.discountPercent ?? null;
      if (dto.discountValueAgorot !== undefined) promotion.discountValueAgorot = dto.discountValueAgorot ?? null;
      if (dto.durationType !== undefined) promotion.durationType = dto.durationType;
      if (dto.durationMonths !== undefined) promotion.durationMonths = dto.durationMonths ?? null;
      if (dto.startsAt !== undefined) promotion.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
      if (dto.endsAt !== undefined) promotion.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
      if (dto.priority !== undefined) promotion.priority = dto.priority;
      if (dto.maxRedemptions !== undefined) promotion.maxRedemptions = dto.maxRedemptions ?? null;
      if (dto.isActive !== undefined) promotion.isActive = dto.isActive;

      const p = await manager.save(Promotion, promotion);

      if (dto.appliesToPlanIds !== undefined) {
        await this.syncPromotionPlansInTx(manager, id, dto.appliesToPlanIds);
      }

      return p;
    });
    return this.toPromotionResponse(saved);
  }

  async deactivatePromotion(id: number): Promise<AdminPromotionResponse> {
    const promotion = await this.promotionRepo.findOneBy({ id });
    if (!promotion) throw new NotFoundException(`מבצע ${id} לא נמצא`);
    promotion.isActive = false;
    const saved = await this.promotionRepo.save(promotion);
    return this.toPromotionResponse(saved);
  }

  async activatePromotion(id: number): Promise<AdminPromotionResponse> {
    const promotion = await this.promotionRepo.findOneBy({ id });
    if (!promotion) throw new NotFoundException(`מבצע ${id} לא נמצא`);
    promotion.isActive = true;
    const saved = await this.promotionRepo.save(promotion);
    return this.toPromotionResponse(saved);
  }

  // ─── Coupons ─────────────────────────────────────────────────────────────────

  async findAllCoupons(): Promise<AdminCouponResponse[]> {
    const coupons = await this.couponRepo.find({ order: { id: 'ASC' } });
    return Promise.all(coupons.map(c => this.toCouponResponse(c)));
  }

  async createCoupon(dto: CreateCouponDto): Promise<AdminCouponResponse> {
    const normalizedCode = dto.code.toUpperCase().trim();
    const saved = await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOneBy(Coupon, { code: normalizedCode });
      if (existing) throw new ConflictException(`קוד קופון "${normalizedCode}" כבר קיים`);
      const coupon = manager.create(Coupon, {
        code: normalizedCode,
        name: dto.name,
        description: dto.description ?? null,
        discountType: dto.discountType,
        discountPercent: dto.discountPercent ?? null,
        discountValueAgorot: dto.discountValueAgorot ?? null,
        durationType: dto.durationType,
        durationMonths: dto.durationMonths ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        maxRedemptions: dto.maxRedemptions ?? null,
        maxRedemptionsPerUser: dto.maxRedemptionsPerUser ?? 1,
        isActive: dto.isActive ?? true,
      });
      const c = await manager.save(Coupon, coupon);
      await this.syncCouponPlansInTx(manager, c.id, dto.appliesToPlanIds ?? []);
      return c;
    });
    return this.toCouponResponse(saved);
  }

  async updateCoupon(id: number, dto: UpdateCouponDto): Promise<AdminCouponResponse> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const coupon = await manager.findOneBy(Coupon, { id });
      if (!coupon) throw new NotFoundException(`קופון ${id} לא נמצא`);

      if (dto.code !== undefined) {
        const normalizedCode = dto.code.toUpperCase().trim();
        const existing = await manager.findOneBy(Coupon, { code: normalizedCode });
        if (existing && existing.id !== id) {
          throw new ConflictException(`קוד קופון "${normalizedCode}" כבר קיים`);
        }
        coupon.code = normalizedCode;
      }
      if (dto.name !== undefined) coupon.name = dto.name;
      if (dto.description !== undefined) coupon.description = dto.description ?? null;
      if (dto.discountType !== undefined) coupon.discountType = dto.discountType;
      if (dto.discountPercent !== undefined) coupon.discountPercent = dto.discountPercent ?? null;
      if (dto.discountValueAgorot !== undefined) coupon.discountValueAgorot = dto.discountValueAgorot ?? null;
      if (dto.durationType !== undefined) coupon.durationType = dto.durationType;
      if (dto.durationMonths !== undefined) coupon.durationMonths = dto.durationMonths ?? null;
      if (dto.startsAt !== undefined) coupon.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
      if (dto.endsAt !== undefined) coupon.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
      if (dto.maxRedemptions !== undefined) coupon.maxRedemptions = dto.maxRedemptions ?? null;
      if (dto.maxRedemptionsPerUser !== undefined) coupon.maxRedemptionsPerUser = dto.maxRedemptionsPerUser ?? 1;
      if (dto.isActive !== undefined) coupon.isActive = dto.isActive;

      const c = await manager.save(Coupon, coupon);

      if (dto.appliesToPlanIds !== undefined) {
        await this.syncCouponPlansInTx(manager, id, dto.appliesToPlanIds);
      }

      return c;
    });
    return this.toCouponResponse(saved);
  }

  async deactivateCoupon(id: number): Promise<AdminCouponResponse> {
    const coupon = await this.couponRepo.findOneBy({ id });
    if (!coupon) throw new NotFoundException(`קופון ${id} לא נמצא`);
    coupon.isActive = false;
    const saved = await this.couponRepo.save(coupon);
    return this.toCouponResponse(saved);
  }

  async activateCoupon(id: number): Promise<AdminCouponResponse> {
    const coupon = await this.couponRepo.findOneBy({ id });
    if (!coupon) throw new NotFoundException(`קופון ${id} לא נמצא`);
    coupon.isActive = true;
    const saved = await this.couponRepo.save(coupon);
    return this.toCouponResponse(saved);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Atomically replaces all promotion_plan rows for a promotion.
   * Must be called from within an active transaction (manager is required).
   *
   * Guarantees: either all plan assignments are updated or none are —
   * the caller's transaction ensures the promotion record and plan rows
   * change together or not at all.
   */
  private async syncPromotionPlansInTx(
    manager: EntityManager,
    promotionId: number,
    planIds: number[],
  ): Promise<void> {
    await manager.delete(PromotionPlan, { promotionId });
    if (planIds.length > 0) {
      await manager.insert(
        PromotionPlan,
        planIds.map(planId => ({ promotionId, planId })),
      );
    }
  }

  private async loadPlanIds(promotionId: number): Promise<number[]> {
    const rows = await this.promotionPlanRepo.find({ where: { promotionId } });
    return rows.map(r => r.planId);
  }

  private async syncCouponPlansInTx(
    manager: EntityManager,
    couponId: number,
    planIds: number[],
  ): Promise<void> {
    await manager.delete(CouponPlan, { couponId });
    if (planIds.length > 0) {
      await manager.insert(
        CouponPlan,
        planIds.map(planId => ({ couponId, planId })),
      );
    }
  }

  private async loadCouponPlanIds(couponId: number): Promise<number[]> {
    const rows = await this.couponPlanRepo.find({ where: { couponId } });
    return rows.map(r => r.planId);
  }

  private async toCouponResponse(c: Coupon): Promise<AdminCouponResponse> {
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description,
      discountType: c.discountType,
      discountPercent: c.discountPercent,
      discountValueAgorot: c.discountValueAgorot,
      durationType: c.durationType,
      durationMonths: c.durationMonths,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      maxRedemptions: c.maxRedemptions,
      currentRedemptions: c.currentRedemptions,
      maxRedemptionsPerUser: c.maxRedemptionsPerUser,
      isActive: c.isActive,
      appliesToPlanIds: await this.loadCouponPlanIds(c.id),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  private async toPromotionResponse(p: Promotion): Promise<AdminPromotionResponse> {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      discountType: p.discountType,
      discountPercent: p.discountPercent,
      discountValueAgorot: p.discountValueAgorot,
      durationType: p.durationType,
      durationMonths: p.durationMonths,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      priority: p.priority,
      maxRedemptions: p.maxRedemptions,
      currentRedemptions: p.currentRedemptions,
      isActive: p.isActive,
      appliesToPlanIds: await this.loadPlanIds(p.id),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
