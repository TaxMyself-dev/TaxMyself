import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class CreateUserSubCategoryDto {

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
  isExpense?: boolean;

}
