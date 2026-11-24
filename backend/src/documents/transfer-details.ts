import { BadRequestException } from '@nestjs/common';
import { DocumentType } from '../enum';

export interface TransferDetails {
  bank: string;
  branch: string;
  accountNumber: string;
  beneficiary: string;
}

/** Document-owned payment instructions; never payment/receipt records. */
export function normalizeTransferDetails(docType: DocumentType, value: unknown): TransferDetails | null {
  if (value == null) return null;
  if (![DocumentType.TRANSACTION_INVOICE, DocumentType.TAX_INVOICE].includes(docType)) {
    throw new BadRequestException('Transfer details are supported only on transaction and tax invoices');
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Invalid transfer details');
  }
  const result = {} as TransferDetails;
  const limits = { bank: 100, branch: 20, accountNumber: 40, beneficiary: 100 };
  for (const key of Object.keys(limits) as (keyof TransferDetails)[]) {
    const field = (value as Record<string, unknown>)[key];
    if (typeof field !== 'string' || !field.trim() || field.trim().length > limits[key]) {
      throw new BadRequestException(`Invalid transfer details: ${key}`);
    }
    result[key] = field.trim();
  }
  return result;
}
