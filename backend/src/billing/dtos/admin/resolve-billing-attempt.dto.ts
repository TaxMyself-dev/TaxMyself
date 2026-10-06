import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class ResolveBillingAttemptDto {
  @IsIn(['CHECK_PROVIDER', 'CONFIRM_NO_CHARGE', 'COMPLETE_CAPTURED'])
  action: 'CHECK_PROVIDER' | 'CONFIRM_NO_CHARGE' | 'COMPLETE_CAPTURED';

  @IsInt() @Min(0)
  expectedStateVersion: number;

  @IsString() @MinLength(10) @MaxLength(500)
  evidence: string;

  @IsOptional() @IsBoolean()
  confirmedNoChargeAndCheckoutClosed?: boolean;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(255)
  lowProfileId?: string;
}
