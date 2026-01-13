import { IsNotEmpty, IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentType, VatOptions } from 'src/enum';

export class LineDataDto {

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  lineNumber: number;

  @IsNotEmpty()
  @IsEnum(DocumentType)
  docType: DocumentType;

  @IsOptional()
  @IsString()
  transType?: string;

  @IsOptional()
  @IsString()
  description?: string; // Can be empty string

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  unitQuantity: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  sum: number;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsString()
  vatOpts?: string | VatOptions; // Frontend sends as string, backend uses enum

  @IsOptional()
  @IsNumber()
  vatRate?: number;

  // Calculated fields
  @IsOptional()
  @IsNumber()
  sumBefVatPerUnit?: number;

  @IsOptional()
  @IsNumber()
  disBefVatPerLine?: number;

  @IsOptional()
  @IsNumber()
  sumAftDisBefVatPerLine?: number;

  @IsOptional()
  @IsNumber()
  vatPerLine?: number;

  @IsOptional()
  @IsNumber()
  sumAftDisWithVat?: number;

  @IsOptional()
  @IsNumber()
  unitType?: number;
}

