import { IsBoolean, IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
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
}
