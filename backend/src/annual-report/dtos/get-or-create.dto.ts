import { IsInt, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetOrCreateAnnualReportDto {
  @IsString()
  businessNumber: string;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  taxYear: number;
}
