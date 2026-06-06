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
} from 'class-validator';
import { DiscountType, DurationType } from '../../enums/billing.enums';

export class CreatePromotionDto {
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
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Plan IDs this promotion applies to. Empty array = applies to all plans. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  appliesToPlanIds?: number[];
}
