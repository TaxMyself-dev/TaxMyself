import { IsInt, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CheckoutPreviewDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  planId: number;
}
