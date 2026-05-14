import { IsNumber, IsString, IsOptional, IsBoolean, ValidateIf, IsDate, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

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
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minSum?: number;

  @IsOptional()
  @Type(() => Number)
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

  @IsOptional()
  @IsString()
  businessNumber?: string | null;

  /**
   * Optional explicit period label (e.g. "3-4/2026") to stamp on the slim row.
   * Sent by the frontend after the user picks an alternative period from the
   * "natural period locked" dialog. Skips the natural-period lock check.
   */
  @IsOptional()
  @IsString()
  targetPeriodLabel?: string;

}
