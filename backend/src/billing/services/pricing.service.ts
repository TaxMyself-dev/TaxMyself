import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Subscription } from '../entities/subscription.entity';

export interface CheckoutPricingResult {
  originalAmountAgorot: number;
  discountAmountAgorot: number;
  finalAmountAgorot: number;
  currency: string;
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
  ) {}

  /**
   * Calculates the final checkout price for a given user and plan.
   *
   * Single discount source: subscription.discountPercent or discountAmountAgorot,
   * active only when today falls within [discountStartDate, discountEndDate] (inclusive,
   * DATE semantics — not DATETIME).
   *
   * couponCode is accepted for backward compatibility but is no longer applied.
   * Coupons and promotions no longer participate in pricing (Phase 2).
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
    const explanation: string[] = [
      `Base price: ${baseAmount} agorot (${plan.name})`,
    ];

    if (couponCode?.trim()) {
      explanation.push(
        `Coupon code "${couponCode}" received but coupon discounts are no longer applied.`,
      );
    }

    const subscription = await this.subscriptionRepo.findOne({
      where: { firebaseId },
    });

    const today = this.getTodayDateString();
    let workingAmount = baseAmount;

    if (subscription) {
      const result = this.applySubscriptionDiscount(baseAmount, subscription, today);
      workingAmount = result.finalAmountAgorot;
      if (result.explanation) explanation.push(result.explanation);
    }

    const unclamped = Math.round(workingAmount);
    const finalAmountAgorot = Math.max(0, unclamped);
    const discountAmountAgorot = baseAmount - finalAmountAgorot;

    if (unclamped < 0) {
      explanation.push('Final amount clamped to 0 agorot (cannot go negative)');
    }

    return {
      originalAmountAgorot: baseAmount,
      discountAmountAgorot,
      finalAmountAgorot,
      currency: plan.currency,
      explanation,
    };
  }

  /**
   * Computes the discounted amount using the subscription's direct discount fields.
   *
   * Date window is checked using DATE semantics (string comparison on 'YYYY-MM-DD').
   * TypeORM hydrates 'date' columns as 'YYYY-MM-DD' strings at runtime despite the
   * Date | null TS type, so String() normalisation is intentional.
   *
   * discountAmountAgorot takes precedence over discountPercent; mutual exclusivity is
   * enforced at the admin write path (AdminBillingService).
   */
  private applySubscriptionDiscount(
    baseAmount: number,
    subscription: Pick<
      Subscription,
      'discountPercent' | 'discountAmountAgorot' | 'discountStartDate' | 'discountEndDate'
    >,
    today: string,
  ): { finalAmountAgorot: number; discountAmountAgorot: number; explanation: string } {
    const { discountPercent, discountAmountAgorot, discountStartDate, discountEndDate } =
      subscription;

    if (discountPercent == null && discountAmountAgorot == null) {
      return { finalAmountAgorot: baseAmount, discountAmountAgorot: 0, explanation: '' };
    }

    // TypeORM returns 'YYYY-MM-DD' strings for type:'date' columns — cast defensively.
    const start = discountStartDate ? String(discountStartDate) : null;
    const end = discountEndDate ? String(discountEndDate) : null;

    const inWindow = (!start || today >= start) && (!end || today <= end);
    if (!inWindow) {
      return {
        finalAmountAgorot: baseAmount,
        discountAmountAgorot: 0,
        explanation: `Subscription discount not active on ${today} (window: ${start ?? '∞'} – ${end ?? '∞'})`,
      };
    }

    let finalAmountAgorot: number;
    let explanation: string;

    if (discountAmountAgorot != null) {
      finalAmountAgorot = baseAmount - discountAmountAgorot;
      explanation = `Subscription discount applied (AMOUNT): ${baseAmount} − ${discountAmountAgorot} = ${finalAmountAgorot} agorot`;
    } else {
      const pct = Math.min(100, Math.max(0, discountPercent!));
      finalAmountAgorot = Math.round(baseAmount * (1 - pct / 100));
      explanation = `Subscription discount applied (PERCENT ${pct}%): ${baseAmount} → ${finalAmountAgorot} agorot`;
    }

    return {
      finalAmountAgorot,
      discountAmountAgorot: baseAmount - finalAmountAgorot,
      explanation,
    };
  }

  /**
   * Returns today's date as 'YYYY-MM-DD' using local time getters, consistent
   * with Israel timezone (UTC+3) and the DATE columns in the subscription table.
   */
  private getTodayDateString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
