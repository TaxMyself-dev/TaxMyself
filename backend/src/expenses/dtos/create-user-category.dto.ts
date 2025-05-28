import { IsString, IsNumber, IsBoolean, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { CreateUserSubCategoryDto } from './create-user-sub-category.dto';
import { Type } from 'class-transformer';

export class CreateUserCategoryDto {

  @IsString()
  categoryName: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateUserSubCategoryDto)
  subCategories: CreateUserSubCategoryDto[];
  
  @IsBoolean()
  @IsOptional()
  isExpense?: boolean;
}

  // @IsNumber()
  // @IsOptional()
  // taxPercent?: number;

  // @IsNumber()
  // @IsOptional()
  // vatPercent?: number;

  // @IsNumber()
  // @IsOptional()
  // reductionPercent?: number;

  // @IsBoolean()
  // @IsOptional()
  // isEquipment?: boolean;

  // @IsBoolean()
  // @IsOptional()
  // isRecognized?: boolean;



