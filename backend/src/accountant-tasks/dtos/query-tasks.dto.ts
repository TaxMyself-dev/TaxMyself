import { IsOptional, IsString, IsIn, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryTasksDto {
  @IsOptional()
  @IsIn(['open', 'done', 'all'])
  status?: 'open' | 'done' | 'all';

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  businessNumber?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays?: number;
}
