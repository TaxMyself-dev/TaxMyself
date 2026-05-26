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

}
