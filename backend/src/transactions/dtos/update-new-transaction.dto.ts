import { IsNumber, IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateNewTransactionDto {

  @IsNumber()
  id: number;

  @IsBoolean()
  isSingleUpdate: boolean;

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

}
