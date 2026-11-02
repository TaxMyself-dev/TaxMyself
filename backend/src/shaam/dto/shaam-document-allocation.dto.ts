import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DocumentType } from '../../enum';
import { ShaamInvoiceAllocationResolutionAction } from '../entities/shaam.enums';

export class ShaamDocumentAllocationDto {
  @IsString()
  @Matches(/^\d{1,20}$/)
  docNumber: string;

  @IsEnum(DocumentType)
  docType: DocumentType;
}

export class ShaamAllocationResolutionDto {
  @IsEnum(ShaamInvoiceAllocationResolutionAction)
  action: ShaamInvoiceAllocationResolutionAction;

  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{1,100}$/)
  evidenceReference: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,50}$/)
  @MaxLength(50)
  allocationNumber?: string;
}

export interface ShaamConfirmationLookupDto {
  customer_vat_number: number;
  vat_number: number;
  payment_amount: number;
  vat_amount: number;
  invoice_date: string;
  invoice_reference_number: string;
}

export interface ShaamInvoiceDetailsDto {
  invoice_type?: number | null;
  vat_number?: number | null;
  customer_vat_number?: number | null;
  invoice_reference_number?: string | null;
  invoice_date?: string | null;
  invoice_issuance_date?: string | null;
  amount_before_discount?: number | null;
  discount?: number | null;
  payment_amount?: number | null;
  vat_amount?: number | null;
  payment_amount_including_vat?: number | null;
}

export interface ShaamInvoiceDetailsResponseDto {
  status?: number;
  message?: ShaamInvoiceDetailsDto | string | null;
}
