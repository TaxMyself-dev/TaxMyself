import { IsNotEmpty, IsString, IsOptional, IsNumber, IsEnum, IsDateString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { BusinessType, DocumentType } from 'src/enum';

export class DocDataDto {

  // Document details

  @IsNotEmpty()
  @IsEnum(BusinessType)
  businessType: BusinessType;

  @IsNotEmpty()
  @IsEnum(DocumentType, {message: `docType must be one of: ${Object.values(DocumentType).join(', ')}`})
  docType: DocumentType;

  @IsNotEmpty()
  @Type(() => String)
  @IsString()
  docNumber: string;

  @IsNotEmpty()
  @Type(() => String)
  @IsString()
  generalDocIndex: string;

  @IsNotEmpty()
  @IsString()
  issuerBusinessNumber: string;

  @IsOptional()
  @IsString()
  docDescription?: string;

  @IsOptional()
  docDate?: string | Date;

  @IsOptional()
  @IsString()
  allocationNum?: string;

  @IsOptional()
  @IsString()
  docSubtitle?: string;

  @IsOptional()
  @IsString()
  parentDocType?: string;

  @IsOptional()
  @IsString()
  parentDocNumber?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  docVatRate: number;

  @IsOptional()
  @IsString()
  currency?: string;

  // Recipient details
  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  recipientId?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  recipientAddress?: string;

  @IsOptional()
  @IsNumber()
  totalVatApplicable?: number;

  @IsOptional()
  @IsNumber()
  totalWithoutVat?: number;

  @IsOptional()
  @IsNumber()
  totalDiscount?: number;

  @IsOptional()
  @IsNumber()
  totalVat?: number;

  @IsOptional()
  @IsBoolean()
  sendEmailToRecipient?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  withholdingTaxAmount?: number;

}

