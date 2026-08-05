import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Cross-field rules (either/or for percent vs. amount, start <= end) are
 * validated in AdminBillingService.updateSubscriptionDiscount, not here.
 */
export class UpdateSubscriptionDiscountDto {
  /** Percentage discount 0-100. Mutually exclusive with discountAmountAgorot. Pass null to clear. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

  /** Fixed discount in agorot (>= 0). Mutually exclusive with discountPercent. Pass null to clear. */
  @IsOptional()
  @IsInt()
  @Min(0)
  discountAmountAgorot?: number | null;

  /** ISO date string. Pass null to clear. */
  @IsOptional()
  @IsDateString()
  discountStartDate?: string | null;

  /** ISO date string. Pass null to clear. */
  @IsOptional()
  @IsDateString()
  discountEndDate?: string | null;
}
