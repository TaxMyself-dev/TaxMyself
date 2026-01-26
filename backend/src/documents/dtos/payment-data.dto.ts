import { IsNotEmpty, IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentDataDto {
  @IsNotEmpty()

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  paymentLineNumber: number;

  @IsNotEmpty()
  paymentDate: string | Date;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  paymentSum: number;

  @IsOptional()
  @IsNumber()
  paymentAmount?: number;

  @IsNotEmpty()
  @IsString()
  paymentMethod: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankNumber?: string;

  @IsOptional()
  @IsString()
  hebrewBankName?: string;

  @IsOptional()
  @IsString()
  branchNumber?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  checkNumber?: string;

  @IsOptional()
  @IsString()
  cardCompany?: string;

  @IsOptional()
  @IsString()
  creditCardName?: string;

  @IsOptional()
  @IsString()
  card4Number?: string;

  @IsOptional()
  @IsString()
  appName?: string;

}