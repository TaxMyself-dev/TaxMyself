import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CancelPlanChangeDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedEventId: number;
}
