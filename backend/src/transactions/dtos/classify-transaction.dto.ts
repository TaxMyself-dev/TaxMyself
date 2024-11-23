import { IsNumber, IsString, IsOptional, IsBoolean } from 'class-validator';

export class ClassifyTransactionDto {

  @IsNumber()
  id: number;

  @IsBoolean()
  isSingleUpdate: boolean;

  @IsBoolean()
  isNewCategory: boolean;

  @IsString()
  name: string;

  @IsString()
  billName: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  subCategory: string;

  @IsBoolean()
  @IsOptional()
  isRecognized?: boolean;

  @IsNumber()
  vatPercent: number;

  @IsNumber()
  taxPercent: number;

  @IsBoolean()
  isEquipment: boolean;

  @IsNumber()
  reductionPercent: number;

  @IsBoolean()
  isExpense?: boolean;

}
