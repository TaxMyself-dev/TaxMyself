import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ReportedSource } from '../report-workflow.entity';

export class SetReportedDto {
  @IsBoolean()
  reported: boolean;

  /** Defaults to MANUAL_ACCOUNTANT when omitted (the only V1 driver). */
  @IsOptional()
  @IsEnum(ReportedSource)
  source?: ReportedSource;
}
