import { IsNumber, IsString, IsOptional, IsBoolean, ValidateIf, IsDate, IsIn } from 'class-validator';

export class ClassifyTransactionDto {

  @IsNumber()
  id: number;

  @IsBoolean()
  isSingleUpdate: boolean;

  @IsString()
  name: string;

  @IsString()
  billName: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  subCategory: string;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsBoolean()
  isRecognized?: boolean;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsNumber()
  vatPercent: number;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsNumber()
  taxPercent: number;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsBoolean()
  isEquipment: boolean;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsNumber()
  reductionPercent: number;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsBoolean()
  isExpense?: boolean;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsDate()
  startDate: Date;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsDate()
  endDate: Date;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsNumber()
  minSum: number;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsNumber()
  maxSum: number;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsString()
  comment: string;

  @IsOptional()
  @IsIn(['equals', 'contains'])
  @IsString()
  matchType?: 'equals' | 'contains';

}
