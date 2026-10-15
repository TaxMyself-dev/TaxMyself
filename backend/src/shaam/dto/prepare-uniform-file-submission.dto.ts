import { IsDateString, IsString, Matches } from 'class-validator';

export class PrepareUniformFileSubmissionDto {
  @IsString()
  @Matches(/^\d{8,9}$/)
  businessNumber: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate: string;
}
