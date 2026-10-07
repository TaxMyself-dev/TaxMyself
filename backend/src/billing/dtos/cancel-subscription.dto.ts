import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { SubscriptionStatus } from '../enums/billing.enums';

export class CancelSubscriptionDto {
  @IsEnum(SubscriptionStatus)
  expectedStatus: SubscriptionStatus;

  @IsOptional()
  @IsDateString()
  expectedPeriodEnd?: string | null;
}
