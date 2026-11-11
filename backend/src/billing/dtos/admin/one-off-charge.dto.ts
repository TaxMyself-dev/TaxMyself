import { IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class OneOffChargeDto {
  @IsUUID('4')
  requestId: string;

  /** Final amount to charge, VAT included, in agorot. */
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  amountAgorot: number;

  @IsString()
  @Length(3, 200)
  description: string;

  @IsString()
  @Length(10, 500)
  consentEvidence: string;
}
