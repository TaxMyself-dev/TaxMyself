import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Body for PATCH /transactions/rules/:id. All fields are optional — only the
 * provided ones are applied. When category/subCategory/percents change, the
 * service propagates the new values to slim_transactions and the cache rows
 * that reference this rule (skipping locked rows).
 */
export class UpdateClassificationRuleDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() subCategory?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100) vatPercent?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) taxPercent?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) reductionPercent?: number;

  @IsOptional() @IsBoolean() isEquipment?: boolean;
  @IsOptional() @IsBoolean() isRecognized?: boolean;
  @IsOptional() @IsBoolean() isExpense?: boolean;

  @IsOptional() startDate?: Date | null;
  @IsOptional() endDate?: Date | null;

  @IsOptional() @IsNumber() minAbsSum?: number | null;
  @IsOptional() @IsNumber() maxAbsSum?: number | null;

  @IsOptional() @IsString() commentPattern?: string | null;
  @IsOptional() @IsIn(['equals', 'contains']) commentMatchType?: 'equals' | 'contains';

  @IsOptional() @IsString() businessNumber?: string | null;
}
