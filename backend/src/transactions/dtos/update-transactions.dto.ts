import { IsNumber, IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateTransactionsDto {

  @IsNumber()
  id: number;

  @IsBoolean()
  isSingleUpdate: boolean;

  // @IsString()
  // @IsOptional()
  // userId?: string;

  @IsString()
  billName?: string;

  @IsString()
  name?: string;

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
