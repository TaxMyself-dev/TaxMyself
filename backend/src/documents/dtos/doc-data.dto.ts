import { IsIsraeliPhone } from 'src/shared/israeli-phone';
import { IsNotEmpty, IsString, IsOptional, IsNumber, IsEnum, IsDateString, IsBoolean, IsObject, ValidateNested, MaxLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BusinessType, DocumentType, DocumentStatusType } from 'src/enum';

const trimText = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class TransferDetailsDto {
  @Transform(trimText) @IsString() @IsNotEmpty() @MaxLength(100)
  bank: string;

  @Transform(trimText) @IsString() @IsNotEmpty() @MaxLength(20)
  branch: string;

  @Transform(trimText) @IsString() @IsNotEmpty() @MaxLength(40)
  accountNumber: string;

  @Transform(trimText) @IsString() @IsNotEmpty() @MaxLength(100)
  beneficiary: string;
}

export class DocDataDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TransferDetailsDto)
  transferDetails?: TransferDetailsDto;


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
  @IsEnum(DocumentStatusType)
  docStatus?: DocumentStatusType;

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
  @IsIsraeliPhone()
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

