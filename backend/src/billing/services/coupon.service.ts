import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon } from '../entities/coupon.entity';
import { CouponPlan } from '../entities/coupon-plan.entity';
import { CouponRedemption } from '../entities/coupon-redemption.entity';

export interface CouponValidationResult {
  coupon: Coupon | null;
  validationError?: string;
}

@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name);

  constructor(
    @InjectRepository(Coupon)
    private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(CouponPlan)
    private readonly couponPlanRepo: Repository<CouponPlan>,
    @InjectRepository(CouponRedemption)
    private readonly couponRedemptionRepo: Repository<CouponRedemption>,
  ) {}

  /**
   * Validates a coupon code for a given user and plan.
   * Returns the coupon if valid, or null with an error message if not.
   *
   * Checks (in order):
   *   1. Coupon exists and is active (soft-deleted coupons excluded automatically)
   *   2. Within valid date range
   *   3. Global redemption limit not exceeded
   *   4. Coupon applies to this plan (coupon_plan join)
   *   5. Per-user redemption limit not exceeded
   */
  async validateCouponForUser(
    firebaseId: string,
    planId: number,
    couponCode: string,
  ): Promise<CouponValidationResult> {
    const code = couponCode.trim().toUpperCase();

    const coupon = await this.couponRepo.findOne({
      where: { code, isActive: true },
    });

    if (!coupon) {
      return { coupon: null, validationError: 'Coupon not found or inactive' };
    }

    const now = new Date();

    if (coupon.startsAt && coupon.startsAt > now) {
      return { coupon: null, validationError: 'Coupon is not yet active' };
    }

    if (coupon.endsAt && coupon.endsAt < now) {
      return { coupon: null, validationError: 'Coupon has expired' };
    }

    if (
      coupon.maxRedemptions !== null &&
      coupon.currentRedemptions >= coupon.maxRedemptions
    ) {
      return {
        coupon: null,
        validationError: 'Coupon total redemption limit has been reached',
      };
    }

    const couponPlan = await this.couponPlanRepo.findOne({
      where: { couponId: coupon.id, planId },
    });

    if (!couponPlan) {
      return {
        coupon: null,
        validationError: 'Coupon is not valid for the selected plan',
      };
    }

    const userRedemptionCount = await this.countUserRedemptions(
      firebaseId,
      coupon.id,
    );

    if (userRedemptionCount >= coupon.maxRedemptionsPerUser) {
      return {
        coupon: null,
        validationError: 'You have already used this coupon',
      };
    }

    return { coupon };
  }

  async countUserRedemptions(
    firebaseId: string,
    couponId: number,
  ): Promise<number> {
    return this.couponRedemptionRepo.count({
      where: { firebaseId, couponId },
    });
  }
}
