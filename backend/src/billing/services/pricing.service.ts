import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { VAT_RATES, BusinessType } from 'src/enum';
import { BusinessService } from 'src/business/business.service';

export interface BillingAmounts {
  amountBeforeVatAgorot: number;
  /** VAT rate as a whole-number percentage, e.g. 18. */
  vatRate: number;
  vatAmountAgorot: number;
  amountIncludingVatAgorot: number;
}

/** The user's effective billing business type — drives which plan price applies. */
export type BillingBusinessType = 'LICENSED' | 'EXEMPT';

export interface CheckoutPricingResult {
  originalAmountAgorot: number;
  discountAmountAgorot: number;
  /** VAT-inclusive total — the amount CardCom will charge. */
  finalAmountAgorot: number;
  amountBeforeVatAgorot: number;
  vatRate: number;
  vatAmountAgorot: number;
  currency: string;
  /** Resolved from the user's businesses — see resolveUserBillingBusinessType. */
  billingBusinessType: BillingBusinessType;
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
    private readonly businessService: BusinessService,
  ) {}

  /**
   * Resolves the user's effective billing business type from all businesses they own:
   * LICENSED ("עוסק מורשה") if at least one owned business is a licensed dealer,
   * otherwise EXEMPT ("עוסק פטור") — including users with no businesses yet.
   */
  async resolveUserBillingBusinessType(firebaseId: string): Promise<BillingBusinessType> {
    const businesses = await this.businessService.getUserBusinesses(firebaseId);
    const hasLicensedDealer = businesses.some((b) => b.businessType === BusinessType.LICENSED);
    const billingBusinessType: BillingBusinessType = hasLicensedDealer ? 'LICENSED' : 'EXEMPT';

    this.logger.log(
      `resolveUserBillingBusinessType: firebaseId=${firebaseId.substring(0, 8)}... ` +
        `businesses=${businesses.length} → ${billingBusinessType}`,
    );

    return billingBusinessType;
  }

  /**
   * Resolves the plan price that applies to a given billing business type.
   * Licensed dealer pricing only applies when the plan defines one — plans
   * without licensedDealerPriceMonthlyAgorot always fall back to the base price.
   */
  resolveEffectivePlanPrice(
    plan: Pick<SubscriptionPlan, 'priceMonthlyAgorot' | 'licensedDealerPriceMonthlyAgorot'>,
    billingBusinessType: BillingBusinessType,
  ): number {
    if (billingBusinessType === 'LICENSED' && plan.licensedDealerPriceMonthlyAgorot != null) {
      return plan.licensedDealerPriceMonthlyAgorot;
    }
    return plan.priceMonthlyAgorot;
  }

  /**
   * Calculates the final checkout price for a given user and plan.
   *
   * Base price is resolved from the user's effective billing business type
   * (see resolveUserBillingBusinessType/resolveEffectivePlanPrice) — never from
   * a price supplied by the caller — so the frontend cannot influence the amount.
   *
   * Single discount source: subscription.discountPercent or discountAmountAgorot,
   * active only when today falls within [discountStartDate, discountEndDate] (inclusive,
   * DATE semantics — not DATETIME).
   */
  async calculateCheckoutPrice(
    firebaseId: string,
    planId: number,
  ): Promise<CheckoutPricingResult> {
    const plan = await this.planRepo.findOne({
      where: { id: planId, isActive: true },
    });

    if (!plan) {
      throw new BadRequestException('Subscription plan not found or not available');
    }

    const billingBusinessType = await this.resolveUserBillingBusinessType(firebaseId);
    const baseAmount = this.resolveEffectivePlanPrice(plan, billingBusinessType);
    const explanation: string[] = [
      `Billing business type: ${billingBusinessType}`,
      `Base price: ${baseAmount} agorot (${plan.name})`,
    ];

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
    const amountBeforeVatAgorot = Math.max(0, unclamped);
    const discountAmountAgorot = baseAmount - amountBeforeVatAgorot;

    if (unclamped < 0) {
      explanation.push('Final amount clamped to 0 agorot (cannot go negative)');
    }

    const vat = this.calculateBillingAmounts(amountBeforeVatAgorot);
    explanation.push(
      `VAT ${vat.vatRate}%: ${amountBeforeVatAgorot} + ${vat.vatAmountAgorot} = ${vat.amountIncludingVatAgorot} agorot`,
    );

    return {
      originalAmountAgorot: baseAmount,
      discountAmountAgorot,
      finalAmountAgorot: vat.amountIncludingVatAgorot,
      amountBeforeVatAgorot: vat.amountBeforeVatAgorot,
      vatRate: vat.vatRate,
      vatAmountAgorot: vat.vatAmountAgorot,
      currency: plan.currency,
      billingBusinessType,
      explanation,
    };
  }

  /**
   * Canonical VAT calculation for all billing flows.
   * VAT is computed from the base price — never back-calculated from a total —
   * so base + vatAmount === total always holds without rounding drift.
   *
   * VAT rate is resolved from the current calendar year via VAT_RATES.
   */
  calculateBillingAmounts(priceBeforeVatAgorot: number): BillingAmounts {
    const year = new Date().getFullYear();
    const vatDecimal = VAT_RATES[year] ?? 0.18;
    const vatRate = Math.round(vatDecimal * 100); // e.g. 18
    const vatAmountAgorot = Math.round(priceBeforeVatAgorot * vatDecimal);
    return {
      amountBeforeVatAgorot: priceBeforeVatAgorot,
      vatRate,
      vatAmountAgorot,
      amountIncludingVatAgorot: priceBeforeVatAgorot + vatAmountAgorot,
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
