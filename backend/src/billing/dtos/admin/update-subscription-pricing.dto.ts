import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
export class UpdateSubscriptionPricingDto {
  @IsIn(['LIVE', 'FROZEN'])
  pricePolicy: 'LIVE' | 'FROZEN';

  @IsOptional() @IsInt() @Min(0) @Max(100000000)
  customMonthlyPriceAgorot: number | null;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  customPriceStartDate: string | null;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  customPriceEndDate: string | null;
}
