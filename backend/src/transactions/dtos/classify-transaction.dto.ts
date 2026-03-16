import { IsNumber, IsString, IsOptional, IsBoolean, ValidateIf, IsDate, IsIn } from 'class-validator';

export class ClassifyTransactionDto {

  @IsString()
  finsiteId: string;

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
  vatPercent?: number;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsNumber()
  taxPercent?: number;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsBoolean()
  isEquipment?: boolean;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsNumber()
  reductionPercent?: number;

  @ValidateIf((o) => o.isSingleUpdate === true)
  @IsBoolean()
  isExpense?: boolean;

  @IsOptional()
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsNumber()
  minSum?: number;

  @IsOptional()
  @IsNumber()
  maxSum?: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsIn(['equals', 'contains'])
  @IsString()
  matchType?: 'equals' | 'contains';

  @IsOptional()
  @IsBoolean()
  confirmOverride?: boolean;

}
