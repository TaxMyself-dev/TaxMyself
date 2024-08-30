import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class CreateUserCategoryDto {

  @IsString()
  categoryName: string;

  @IsString()
  subCategoryName: string;

  @IsNumber()
  @IsOptional()
  taxPercent?: number;

  @IsNumber()
  @IsOptional()
  vatPercent?: number;

  @IsNumber()
  @IsOptional()
  reductionPercent?: number;

  @IsBoolean()
  @IsOptional()
  isEquipment?: boolean;

  @IsBoolean()
  @IsOptional()
  isRecognized?: boolean;

}
