import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionDiscount } from '../entities/subscription-discount.entity';
import { Coupon } from '../entities/coupon.entity';
import { Promotion } from '../entities/promotion.entity';
import { DiscountType } from '../enums/billing.enums';
import { CouponService } from './coupon.service';
import { PromotionService } from './promotion.service';

export interface CheckoutPricingResult {
  originalAmountAgorot: number;
  discountAmountAgorot: number;
  finalAmountAgorot: number;
  currency: string;
  appliedSubscriptionDiscount: SubscriptionDiscount | null;
  appliedPromotion: Promotion | null;
  appliedCoupon: Coupon | null;
  /** Human-readable breakdown for the UI / debugging. */
  explanation: string[];
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionDiscount)
    private readonly subscriptionDiscountRepo: Repository<SubscriptionDiscount>,
    private readonly couponService: CouponService,
    private readonly promotionService: PromotionService,
  ) {}

  /**
   * Calculates the final checkout price for a given user, plan, and optional
   * coupon code.
   *
   * Discount priority (highest → lowest):
   *   1. subscription_discount (private, manual, tied to this subscription)
   *   2. best active promotion for the plan (if no subscription_discount)
   *   3. coupon code (always stacked on top of whichever of the above applied)
   *
   * Final amount is always clamped to ≥ 0.
   */
  async calculateCheckoutPrice(
    firebaseId: string,
    planId: number,
    couponCode?: string,
  ): Promise<CheckoutPricingResult> {
    const plan = await this.planRepo.findOne({
      where: { id: planId, isActive: true },
    });

    if (!plan) {
      throw new BadRequestException('Subscription plan not found or not available');
    }

    const baseAmount = plan.priceMonthlyAgorot;
    let workingAmount = baseAmount;
    const explanation: string[] = [
      `Base price: ${baseAmount} agorot (${plan.name})`,
    ];

    let appliedSubscriptionDiscount: SubscriptionDiscount | null = null;
    let appliedPromotion: Promotion | null = null;
    let appliedCoupon: Coupon | null = null;

    // 1. Check for a private subscription_discount (highest priority).
    const subscription = await this.subscriptionRepo.findOne({
      where: { firebaseId },
    });

    if (subscription) {
      appliedSubscriptionDiscount = await this.findActiveSubscriptionDiscount(
        subscription.id,
      );
    }

    if (appliedSubscriptionDiscount) {
      const after = this.applyDiscountToAmount(
        workingAmount,
        appliedSubscriptionDiscount.discountType,
        appliedSubscriptionDiscount.discountValueAgorot,
        appliedSubscriptionDiscount.discountPercent,
      );
      explanation.push(
        `Subscription discount applied (${appliedSubscriptionDiscount.discountType}): ${workingAmount} → ${after} agorot`,
      );
      workingAmount = after;
    } else {
      // 2. No subscription_discount — try the best active promotion.
      appliedPromotion =
        await this.promotionService.getBestActivePromotionForPlan(planId);

      if (appliedPromotion) {
        const after = this.applyDiscountToAmount(
          workingAmount,
          appliedPromotion.discountType,
          appliedPromotion.discountValueAgorot,
          appliedPromotion.discountPercent,
        );
        explanation.push(
          `Promotion "${appliedPromotion.name}" applied (${appliedPromotion.discountType}): ${workingAmount} → ${after} agorot`,
        );
        workingAmount = after;
      }
    }

    // 3. Apply coupon on top of whatever discount was applied above.
    if (couponCode?.trim()) {
      const { coupon, validationError } =
        await this.couponService.validateCouponForUser(
          firebaseId,
          planId,
          couponCode,
        );

      if (coupon) {
        const after = this.applyDiscountToAmount(
          workingAmount,
          coupon.discountType,
          coupon.discountValueAgorot,
          coupon.discountPercent,
        );
        explanation.push(
          `Coupon "${coupon.code}" applied (${coupon.discountType}): ${workingAmount} → ${after} agorot`,
        );
        workingAmount = after;
        appliedCoupon = coupon;
      } else {
        explanation.push(
          `Coupon "${couponCode}" rejected: ${validationError}`,
        );
      }
    }

    const finalAmountAgorot = Math.max(0, Math.round(workingAmount));
    const discountAmountAgorot = baseAmount - finalAmountAgorot;

    if (finalAmountAgorot < workingAmount) {
      explanation.push('Final amount clamped to 0 agorot (cannot go negative)');
    }

    return {
      originalAmountAgorot: baseAmount,
      discountAmountAgorot,
      finalAmountAgorot,
      currency: plan.currency,
      appliedSubscriptionDiscount,
      appliedPromotion,
      appliedCoupon,
      explanation,
    };
  }

  /**
   * Finds the most recently created active subscription_discount for a
   * subscription that is currently within its valid date window.
   */
  async findActiveSubscriptionDiscount(
    subscriptionId: number,
  ): Promise<SubscriptionDiscount | null> {
    const now = new Date();

    const discounts = await this.subscriptionDiscountRepo.find({
      where: { subscriptionId, isActive: true },
      order: { createdAt: 'DESC' },
    });

    const inWindow = discounts.filter((d) => {
      if (d.startsAt && d.startsAt > now) return false;
      if (d.endsAt && d.endsAt < now) return false;
      return true;
    });

    return inWindow[0] ?? null;
  }

  /**
   * Applies a single discount rule to an amount and returns the new amount.
   * Does NOT clamp to 0 — clamping is the caller's responsibility.
   */
  private applyDiscountToAmount(
    baseAmount: number,
    discountType: DiscountType,
    discountValueAgorot: number | null,
    discountPercent: number | null,
  ): number {
    switch (discountType) {
      case DiscountType.PERCENT: {
        const pct = Math.min(100, Math.max(0, discountPercent ?? 0));
        return Math.round(baseAmount * (1 - pct / 100));
      }
      case DiscountType.FIXED_AMOUNT:
        return baseAmount - (discountValueAgorot ?? 0);
      case DiscountType.FIXED_PRICE:
        return discountValueAgorot ?? 0;
      default:
        return baseAmount;
    }
  }
}
