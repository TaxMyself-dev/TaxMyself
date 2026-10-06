import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BillingAccessMode } from '../../enums/billing.enums';

/** Admin-only grant/revoke of the non-paying full-access billing entitlement. */
export class UpdateSubscriptionBillingAccessModeDto {
  @IsEnum(BillingAccessMode)
  billingAccessMode: BillingAccessMode;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
