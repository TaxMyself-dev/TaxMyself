import { IsNumber, IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateTransactionsDto {
  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  paymentIdentifier?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  billDate?: number;

  @IsNumber()
  @IsOptional()
  payDate?: number;

  @IsNumber()
  @IsOptional()
  sum?: number;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  subCategory?: string;

  @IsBoolean()
  @IsOptional()
  isRecognized?: boolean;

  @IsNumber()
  @IsOptional()
  vatPercent?: number;

  @IsNumber()
  @IsOptional()
  taxPercent?: number;

  @IsBoolean()
  @IsOptional()
  isEquipment?: boolean;

  @IsNumber()
  @IsOptional()
  reductionPercent?: number;
}
