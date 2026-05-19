import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ExpenseReportScope } from 'src/enum';

/**
 * DTO for classifyWithRule() — rule-based classification.
 *
 * Used when the user classifies a transaction and wants to create or
 * update a merchant rule (isSingleUpdate = false in the frontend).
 *
 * billId and merchantName are resolved from the cache row — the caller
 * only supplies the externalTransactionId.
 */
export class ClassifyWithRuleDto {
  @IsString()
  @IsNotEmpty()
  externalTransactionId: string;

  // -- Classification fields (always required) --

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  subCategory: string;

  @IsInt()
  @Min(0)
  @Max(100)
  vatPercent: number;

  @IsInt()
  @Min(0)
  @Max(100)
  taxPercent: number;

  @IsInt()
  @Min(0)
  @Max(100)
  reductionPercent: number;

  @IsBoolean()
  isEquipment: boolean;

  @IsBoolean()
  isRecognized: boolean;

  /** P&L vs annual-report-only scope, taken from the chosen subcategory. */
  @IsOptional()
  @IsEnum(ExpenseReportScope)
  reportScope?: ExpenseReportScope;

  // -- Rule metadata --

  @IsOptional()
  @IsBoolean()
  isExpense?: boolean;

  // -- Optional rule constraints --

  @IsOptional()
  startDate?: Date | null;

  @IsOptional()
  endDate?: Date | null;

  @IsOptional()
  @IsNumber()
  minAbsSum?: number | null;

  @IsOptional()
  @IsNumber()
  maxAbsSum?: number | null;

  @IsOptional()
  @IsString()
  commentPattern?: string | null;

  @IsOptional()
  @IsIn(['equals', 'contains'])
  commentMatchType?: 'equals' | 'contains';

  /**
   * When true, overrides an existing ONE_TIME classification on the
   * current transaction.  The frontend must set this only after the user
   * explicitly confirms the override prompt.
   *
   * Ignored when no ONE_TIME slim row exists.
   */
  @IsOptional()
  @IsBoolean()
  confirmOverride?: boolean;

  /**
   * Optional business attribution override. When provided, both the rule
   * and matching slim/cache rows are written with this businessNumber
   * instead of the bill's default.
   */
  @IsOptional()
  @IsString()
  businessNumber?: string | null;

  /**
   * Explicit period label for the FOCUS transaction when its natural period
   * is locked. Frontend supplies this after the user picks from the locked-
   * period dialog. Backfilled rows always use their own natural period (or
   * are skipped if locked).
   */
  @IsOptional()
  @IsString()
  targetPeriodLabel?: string;
}
