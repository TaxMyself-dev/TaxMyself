import { IsBoolean, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class UpdateBusinessDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsOptional()
  @IsString()
  businessNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  advanceTaxPercent?: number;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  businessAddress?: string;

  @IsOptional()
  @IsString()
  businessPhone?: string;

  @IsOptional()
  @IsString()
  businessEmail?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsString()
  vatReportingType?: string;

  @IsOptional()
  @IsString()
  taxReportingType?: string;

  @IsOptional()
  @IsBoolean()
  nationalInsRequired?: boolean;
}
