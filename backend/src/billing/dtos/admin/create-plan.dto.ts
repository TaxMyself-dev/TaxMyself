import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ModuleName } from 'src/enum';

export class CreatePlanDto {
  @IsString()
  @MaxLength(100)
  slug: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Price in agorot (integer). ₪54.00 = 5400. */
  @IsInt()
  @Min(0)
  priceMonthlyAgorot: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(ModuleName, { each: true })
  modules?: ModuleName[];

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}
