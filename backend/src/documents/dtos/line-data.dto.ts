import { IsNotEmpty, IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DocumentType, UnitOfMeasure, VatOptions } from 'src/enum';

const toOptionalNumber = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') return value;
  return Number(value);
};

const normalizeVatOption = (value: unknown): unknown => {
  const numericValueToName: Record<string, string> = {
    [String(VatOptions.INCLUDE)]: 'INCLUDE',
    [String(VatOptions.EXCLUDE)]: 'EXCLUDE',
    [String(VatOptions.WITHOUT)]: 'WITHOUT',
  };
  return numericValueToName[String(value)] ?? value;
};

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
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  discount?: number;

  @IsOptional()
  @Transform(({ value }) => normalizeVatOption(value))
  @IsString()
  vatOpts?: string | VatOptions; // Frontend sends as string, backend uses enum

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  vatRate?: number;

  // Calculated fields
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  sumBefVatPerUnit?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  disBefVatPerLine?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  sumAftDisBefVatPerLine?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  vatPerLine?: number;

  @IsOptional()
  @Transform(({ value, obj }) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;

    // A draft restored from MySQL can contain DECIMAL strings. Older frontend
    // code concatenated net + VAT (for example "6000.001080.00") instead of
    // adding them. Rebuild this derived value from the two authoritative line
    // amounts rather than rejecting an otherwise valid, already-allocated doc.
    const net = Number(obj?.sumAftDisBefVatPerLine);
    const vat = Number(obj?.vatPerLine);
    return Number.isFinite(net) && Number.isFinite(vat) ? net + vat : parsed;
  })
  @IsNumber()
  sumAftDisWithVat?: number;

  @IsOptional()
  @IsEnum(UnitOfMeasure)
  unitType?: UnitOfMeasure;
}

