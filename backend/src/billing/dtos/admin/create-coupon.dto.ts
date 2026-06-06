import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DiscountType, DurationType } from '../../enums/billing.enums';

export class CreateCouponDto {
  /** Unique coupon code entered by the user at checkout. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(DiscountType)
  discountType: DiscountType;

  /** Percentage value (0–100). Used when discountType = PERCENT. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  /** Amount or final price in agorot. Used for FIXED_AMOUNT and FIXED_PRICE. */
  @IsOptional()
  @IsInt()
  @Min(0)
  discountValueAgorot?: number;

  @IsEnum(DurationType)
  durationType: DurationType;

  /** Number of billing cycles. Required when durationType = REPEATING. */
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMonths?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  /** Maximum times a single user may redeem this coupon. Defaults to 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptionsPerUser?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Plan IDs this coupon is valid for. Empty array = valid for all plans. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  appliesToPlanIds?: number[];
}
