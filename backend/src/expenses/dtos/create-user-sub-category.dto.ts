import { IsString, IsNumber, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ExpenseReportScope } from 'src/enum';

export class CreateUserSubCategoryDto {

  @IsString()
  @IsOptional()
  categoryName: string;

  @IsString()
  subCategoryName: string;

  @IsNumber()
  @IsOptional()
  taxPercent: number;

  @IsNumber()
  @IsOptional()
  vatPercent: number;

  @IsNumber()
  @IsOptional()
  reductionPercent: number;

  @IsBoolean()
  @IsOptional()
  isEquipment: boolean;

  @IsBoolean()
  @IsOptional()
  isRecognized: boolean;

  @IsBoolean()
  @IsOptional()
  isExpense: boolean;

  @IsEnum(ExpenseReportScope)
  @IsOptional()
  reportScope?: ExpenseReportScope;

  @IsString()
  @IsOptional()
  pnlCategory?: string | null;

  /**
   * Phase 5.3 (D5): "יטופל ע"י רואה החשבון" — save the sub_category WITHOUT
   * accounting mapping (MISSING_ACCOUNTING_MAPPING, accountId NULL). Only
   * allowed when the client has an ACTIVE delegation; a client without an
   * accountant must pick a mapping (the D9 simple picker) and gets a 400.
   */
  @IsBoolean()
  @IsOptional()
  deferToAccountant?: boolean;

  /**
   * Phase 6.2 (D5 option 1): הוצאה פרטית — no card, never journaled,
   * excluded from business reports entirely. Wins over every other
   * mapping field on the row.
   */
  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean;

  /**
   * Phase 6.2 (D5/D9 simple picker): explicit card choice — "למה ההוצאה
   * שייכת?". The card carries the full accounting law (D1), so no percent
   * fields accompany it. Must be visible to the caller's catalog context.
   */
  @IsNumber()
  @IsOptional()
  accountId?: number;

}
