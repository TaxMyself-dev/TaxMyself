import { IsISO8601, IsOptional, Matches } from 'class-validator';

export class CreateUniformFileSubmissionDto {
  @IsISO8601({ strict: true })
  startDate: string;

  @IsISO8601({ strict: true })
  endDate: string;

  @IsOptional()
  @Matches(/^\d{1,9}$/)
  representorCompanyId?: string;
}
