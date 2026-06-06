import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Promotion } from '../entities/promotion.entity';
import { PromotionPlan } from '../entities/promotion-plan.entity';
import { Coupon } from '../entities/coupon.entity';
import { CouponPlan } from '../entities/coupon-plan.entity';
import { CreatePlanDto } from '../dtos/admin/create-plan.dto';
import { UpdatePlanDto } from '../dtos/admin/update-plan.dto';
import { CreatePromotionDto } from '../dtos/admin/create-promotion.dto';
import { UpdatePromotionDto } from '../dtos/admin/update-promotion.dto';
import { CreateCouponDto } from '../dtos/admin/create-coupon.dto';
import { UpdateCouponDto } from '../dtos/admin/update-coupon.dto';

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
