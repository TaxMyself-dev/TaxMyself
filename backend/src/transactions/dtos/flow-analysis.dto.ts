import { IsDateString, IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';

export class FlowAnalysisDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNotEmpty()
  @IsString()
  billId: string;

  @IsIn(['all', 'category', 'subCategory', 'merchant', 'paymentMethod'])
  lineFilterType: 'all' | 'category' | 'subCategory' | 'merchant' | 'paymentMethod';

  @ValidateIf(o => o.lineFilterType !== 'all')
  @IsNotEmpty()
  @IsString()
  lineFilterValue?: string;
}
