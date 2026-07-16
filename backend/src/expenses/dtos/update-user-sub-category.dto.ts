import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ExpenseNecessity } from 'src/enum';

/**
 * Body for PATCH /expenses/user-sub-category/:id. Only the parameters that
 * commonly need fixing are editable; renaming (subCategoryName or
 * categoryName) is not supported via PATCH — delete + add to rename.
 */
export class UpdateUserSubCategoryDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPercent?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) taxPercent?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) reductionPercent?: number;

  @IsOptional() @IsBoolean() isEquipment?: boolean;
  @IsOptional() @IsBoolean() isRecognized?: boolean;
  @IsOptional() @IsBoolean() isExpense?: boolean;

  @IsOptional() @IsEnum(ExpenseNecessity) necessity?: ExpenseNecessity;

  /** P&L presentation category override; null clears it back to bookkeeping category. */
  @IsOptional() @IsString() pnlCategory?: string | null;
}
