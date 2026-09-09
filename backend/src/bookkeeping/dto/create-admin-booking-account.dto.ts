import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { BusinessFieldType, RecognitionType } from 'src/enum';

/**
 * Admin-only creation of a new operational SYSTEM booking account. Unlike
 * the accountant D11 DTO, its ownership is fixed by the route and therefore
 * has no availableFor/businessNumber fields.
 */
export class CreateAdminBookingAccountDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @Matches(/^\d{1,15}$/, { message: 'code must be a numeric string' })
  code?: string;

  @IsInt()
  sectionId: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  code6111?: string | null;

  @IsOptional()
  @IsEnum(RecognitionType)
  recognitionType?: RecognitionType;

  @IsNumber()
  vatPercent: number;

  @IsNumber()
  taxPercent: number;

  @IsOptional()
  @IsNumber()
  reductionPercent?: number;

  @IsOptional()
  @IsBoolean()
  isEquipment?: boolean;

  @IsOptional()
  @IsBoolean()
  technicalOnly?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoryName?: string;

  @IsOptional()
  @IsIn(['expense', 'income'])
  type?: 'expense' | 'income';

  @IsArray()
  @ArrayNotEmpty({ message: 'at least one business type must be selected' })
  @IsEnum(BusinessFieldType, { each: true })
  visibleBusinessTypes: BusinessFieldType[];
}
