import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCheckoutDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  planId: number;

  /** Prevent a stale debt-settlement screen from initiating a new purchase. */
  @IsOptional()
  @IsBoolean()
  recoveryOnly?: boolean;

  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  recoveryQuote?: string;

  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  planChangeQuote?: string;

  @IsOptional()
  @IsDateString()
  planChangeQuotedAt?: string;
}
