import {
    IsString,
    IsNumber,
    Min,
    Max,
    IsDateString,
    IsBoolean,
    IsOptional
} from 'class-validator'


export class CreateExpenseDto {

  @IsString()
  supplier: string;

  @IsString()
  category: string;

  @IsNumber()
  sum: number;

  @IsNumber()
  taxPercent: number;

  @IsNumber()
  vatPercent: number;

  @IsDateString()
  date: Date;

  @IsOptional()
  @IsString()
  note: string;

  @IsOptional()
  @IsString()
  file: string;

  @IsOptional()
  @IsBoolean()
  equipment: boolean;
}