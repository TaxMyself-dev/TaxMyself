import { IsNotEmpty, IsString, IsArray, ValidateNested, IsOptional, IsNumber, IsEnum, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentType, PaymentMethodType } from 'src/enum';
import { DocDataDto } from './doc-data.dto';
import { LineDataDto } from './line-data.dto';
import { PaymentDataDto } from './payment-data.dto';

export class CreateDocDto {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => DocDataDto)
  docData: DocDataDto;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineDataDto)
  linesData: LineDataDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDataDto)
  paymentData?: PaymentDataDto[];
}

