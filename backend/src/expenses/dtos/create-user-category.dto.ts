import { IsString, IsNumber, IsBoolean, IsOptional, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { CreateUserSubCategoryDto } from './create-user-sub-category.dto';
import { Type } from 'class-transformer';
import { RecognitionType } from 'src/enum';

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

  /** Phase 6.2: UI hint — pre-fills the D5 recognition choice when the
   *  client later adds sub-categories under this category. Never consulted
   *  by accounting law resolution (that lives on the card, D1). */
  @IsEnum(RecognitionType)
  @IsOptional()
  defaultRecognitionType?: RecognitionType;
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



