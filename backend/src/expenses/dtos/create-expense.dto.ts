import {
    IsString,
    IsNumber,
    Min,
    Max,
    IsDateString,
    IsBoolean,
    IsOptional
} from 'class-validator'


// create-form.dto.ts

//import { IsString, IsNumber, IsBoolean, IsOptional, IsDate } from 'class-validator';

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

//export class CreateExpenseDto {

//     @IsDateString()
//     date_added: Date;

//     @IsNumber()
//     price: number;

//     @IsDateString()
//     date: Date;

//     @IsString()
//     supplier: string;

//     @IsString()
//     category: string;

//     @IsNumber()
//     @Min(0)
//     @Max(100)
//     tax_percent: number;

//     @IsNumber()
//     @Min(0)
//     @Max(100)
//     vat_percent: number;

//     @IsBoolean()
//     equipment: boolean;

// }