import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportWorkflowStatus } from '../report-workflow.entity';

export class ListWorkflowsDto {
  @IsOptional()
  @IsEnum(ReportWorkflowStatus)
  status?: ReportWorkflowStatus;

  @IsOptional()
  @IsString()
  businessNumber?: string;
}
