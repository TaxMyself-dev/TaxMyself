import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Documents } from '../../documents/documents.entity';
import { DocumentsService } from '../../documents/documents.service';
import { DocumentStatusType, DocumentType } from '../../enum';
import { ShaamApprovalDto } from '../dto/shaam-approval.dto';
import {
  ShaamConfirmationLookupDto,
  ShaamInvoiceDetailsDto,
} from '../dto/shaam-document-allocation.dto';
import { ShaamInvoicesService } from './shaam-invoices.service';

const ACCOUNTING_SOFTWARE_NUMBER = 258001;

@Injectable()
export class ShaamDocumentAllocationService {
  constructor(
    @InjectRepository(Documents)
    private readonly documentsRepo: Repository<Documents>,
    private readonly invoices: ShaamInvoicesService,
    private readonly documentsService: DocumentsService,
  ) {}

  async requestAndFinalize(
    accessToken: string,
    userId: string,
    issuerBusinessNumber: string,
    docNumber: string,
    docType: DocumentType,
  ): Promise<any> {
    const doc = await this.getDocument(
      issuerBusinessNumber,
      docNumber,
      docType,
    );

    // A successful SHAAM response is persisted before PDF generation. If the
    // latter failed (or the browser lost the response), retry only finalizes the
    // same invoice and never sends a second approval request.
    if (doc.allocationNum) {
      return this.finalizeOrReturnExisting(userId, doc);
    }
    this.assertPending(doc);

    // Always recover first. This catches an allocation whose earlier response
    // was lost. An ambiguous recovery error is propagated, so we never risk a
    // duplicate Approval request for the same final invoice reference.
    const recovered = await this.invoices.recoverConfirmation(
      accessToken,
      this.buildConfirmationLookup(doc),
    );
    const recoveredConfirmationNumber =
      this.extractConfirmationNumber(recovered);
    if (recoveredConfirmationNumber) {
      const verified = await this.verifyRecoveredConfirmation(
        accessToken,
        doc,
        recoveredConfirmationNumber,
      );
      if (verified) {
        await this.persistAllocation(doc, recoveredConfirmationNumber);
        return this.documentsService.finalizeAllocation(userId, {
          issuerBusinessNumber,
          docNumber,
          docType,
        });
      }
      if (!this.isTsandbox()) {
        throw new BadGatewayException(
          'Recovered SHAAM allocation does not match the persisted invoice',
        );
      }
    }

    const response = await this.invoices.submitApproval(
      accessToken,
      this.buildApprovalPayload(doc),
    );
    const confirmationNumber = this.extractConfirmationNumber(response);
    if (!response.approved || !confirmationNumber) {
      return response;
    }

    await this.persistAllocation(doc, confirmationNumber);
    return this.documentsService.finalizeAllocation(userId, {
      issuerBusinessNumber,
      docNumber,
      docType,
    });
  }

  async recoverAndFinalize(
    accessToken: string,
    userId: string,
    issuerBusinessNumber: string,
    docNumber: string,
    docType: DocumentType,
  ): Promise<any> {
    const doc = await this.getDocument(
      issuerBusinessNumber,
      docNumber,
      docType,
    );
    if (doc.allocationNum) {
      return this.finalizeOrReturnExisting(userId, doc);
    }
    this.assertPending(doc);

    const response = await this.invoices.recoverConfirmation(
      accessToken,
      this.buildConfirmationLookup(doc),
    );
    const confirmationNumber = this.extractConfirmationNumber(response);
    if (!confirmationNumber) {
      throw new NotFoundException({
        code: 'ALLOCATION_NOT_FOUND',
        message: 'No allocation number was found for the persisted invoice',
      });
    }

    const verified = await this.verifyRecoveredConfirmation(
      accessToken,
      doc,
      confirmationNumber,
    );
    if (!verified) {
      throw new BadGatewayException(
        'Recovered SHAAM allocation does not match the persisted invoice',
      );
    }

    await this.persistAllocation(doc, confirmationNumber);
    return this.documentsService.finalizeAllocation(userId, {
      issuerBusinessNumber,
      docNumber,
      docType,
    });
  }

  private async getDocument(
    issuerBusinessNumber: string,
    docNumber: string,
    docType: DocumentType,
  ): Promise<Documents> {
    const doc = await this.documentsRepo.findOne({
      where: { issuerBusinessNumber, docNumber, docType },
    });
    if (!doc) throw new NotFoundException('Persisted invoice not found');
    return doc;
  }

  private assertPending(doc: Documents): void {
    if (doc.docStatus !== DocumentStatusType.PENDING_ALLOCATION) {
      throw new BadRequestException('Invoice is not pending allocation');
    }
  }

  private async persistAllocation(
    doc: Documents,
    allocationNum: string,
  ): Promise<void> {
    doc.allocationNum = allocationNum;
    await this.documentsRepo.save(doc);
  }

  private async finalizeOrReturnExisting(
    userId: string,
    doc: Documents,
  ): Promise<any> {
    if (doc.docStatus === DocumentStatusType.PENDING_ALLOCATION) {
      return this.documentsService.finalizeAllocation(userId, {
        issuerBusinessNumber: doc.issuerBusinessNumber,
        docNumber: doc.docNumber,
        docType: doc.docType,
      });
    }
    return {
      success: true,
      docType: doc.docType,
      docNumber: doc.docNumber,
      generalDocIndex: doc.generalDocIndex,
      allocationNum: doc.allocationNum,
      file: doc.file,
      copyFile: doc.copyFile,
      docStatus: doc.docStatus,
      alreadyFinalized: true,
    };
  }

  private buildApprovalPayload(doc: Documents): ShaamApprovalDto {
    const vatNumber = this.requiredVatNumber(
      doc.issuerBusinessNumber,
      'issuerBusinessNumber',
    );
    const customerVatNumber = this.requiredVatNumber(
      doc.recipientId,
      'recipientId',
    );
    const invoiceDate = this.toApiDate(doc.docDate, 'docDate');
    const issuanceDate = this.toApiDate(doc.issueDate, 'issueDate');

    return Object.assign(new ShaamApprovalDto(), {
      user_id: vatNumber,
      accounting_software_number: ACCOUNTING_SOFTWARE_NUMBER,
      amount_before_discount: Number(doc.sumBefDisBefVat),
      customer_vat_number: customerVatNumber,
      discount: Number(doc.disSum || 0),
      invoice_date: invoiceDate,
      invoice_id: `KT-${doc.issuerBusinessNumber}-${doc.generalDocIndex}`,
      invoice_issuance_date: issuanceDate,
      invoice_reference_number: doc.docNumber,
      invoice_type: this.toShaamInvoiceType(doc.docType),
      payment_amount: Number(doc.sumAftDisBefVAT),
      payment_amount_including_vat: Number(doc.sumAftDisWithVAT),
      vat_amount: Number(doc.vatSum),
      vat_number: vatNumber,
    });
  }

  private buildConfirmationLookup(doc: Documents): ShaamConfirmationLookupDto {
    return {
      customer_vat_number: this.requiredVatNumber(
        doc.recipientId,
        'recipientId',
      ),
      vat_number: this.requiredVatNumber(
        doc.issuerBusinessNumber,
        'issuerBusinessNumber',
      ),
      payment_amount: Number(doc.sumAftDisBefVAT),
      vat_amount: Number(doc.vatSum),
      invoice_date: this.toApiDate(doc.docDate, 'docDate'),
      invoice_reference_number: doc.docNumber,
    };
  }

  private async verifyRecoveredConfirmation(
    accessToken: string,
    doc: Documents,
    confirmationNumber: string,
  ): Promise<boolean> {
    const vatNumber = this.requiredVatNumber(
      doc.issuerBusinessNumber,
      'issuerBusinessNumber',
    );
    const customerVatNumber = this.requiredVatNumber(
      doc.recipientId,
      'recipientId',
    );
    const response = await this.invoices.getInvoiceDetails(
      accessToken,
      confirmationNumber,
      vatNumber,
      customerVatNumber,
    );
    const details =
      response?.message && typeof response.message === 'object'
        ? response.message
        : null;
    if (!details) return false;
    return this.detailsMatchDocument(
      details,
      doc,
      vatNumber,
      customerVatNumber,
    );
  }

  private detailsMatchDocument(
    details: ShaamInvoiceDetailsDto,
    doc: Documents,
    vatNumber: number,
    customerVatNumber: number,
  ): boolean {
    return (
      Number(details.invoice_type) === this.toShaamInvoiceType(doc.docType) &&
      Number(details.vat_number) === vatNumber &&
      Number(details.customer_vat_number) === customerVatNumber &&
      String(details.invoice_reference_number ?? '') === doc.docNumber &&
      String(details.invoice_date ?? '') ===
        this.toApiDate(doc.docDate, 'docDate') &&
      String(details.invoice_issuance_date ?? '') ===
        this.toApiDate(doc.issueDate, 'issueDate') &&
      this.amountsMatch(details.amount_before_discount, doc.sumBefDisBefVat) &&
      this.amountsMatch(details.discount, doc.disSum || 0) &&
      this.amountsMatch(details.payment_amount, doc.sumAftDisBefVAT) &&
      this.amountsMatch(details.vat_amount, doc.vatSum) &&
      this.amountsMatch(
        details.payment_amount_including_vat,
        doc.sumAftDisWithVAT,
      )
    );
  }

  private amountsMatch(
    actual: number | null | undefined,
    expected: unknown,
  ): boolean {
    if (actual == null) return false;
    return Math.abs(Number(actual) - Number(expected)) <= 0.01;
  }

  private isTsandbox(): boolean {
    return (process.env.SHAAM_ENV || 'tsandbox').toLowerCase() === 'tsandbox';
  }

  private requiredVatNumber(
    value: string | null | undefined,
    field: string,
  ): number {
    const normalized = String(value ?? '').trim();
    if (!/^\d{9}$/.test(normalized)) {
      throw new BadRequestException(`${field} must contain exactly 9 digits`);
    }
    return Number(normalized);
  }

  private toApiDate(value: Date | string, field: string): string {
    const raw = String(value ?? '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
      throw new BadRequestException(`${field} is invalid`);
    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, '0'),
      String(parsed.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private toShaamInvoiceType(docType: DocumentType): number {
    switch (docType) {
      case DocumentType.TAX_INVOICE:
        return 305;
      case DocumentType.TAX_INVOICE_RECEIPT:
        return 320;
      case DocumentType.CREDIT_INVOICE:
        return 330;
      default:
        throw new BadRequestException(
          `Document type ${docType} does not support allocation`,
        );
    }
  }

  private extractConfirmationNumber(response: any): string | null {
    const value =
      response?.confirmation_number ??
      response?.Confirmation_Number ??
      response?.message?.confirmation_number ??
      response?.message?.Confirmation_Number ??
      response?.Message?.confirmation_number ??
      response?.Message?.Confirmation_Number ??
      (/^\d{9,30}$/.test(String(response?.message ?? '').trim())
        ? response.message
        : null);
    if (value == null || String(value).trim() === '') return null;
    const normalized = String(value).trim();
    if (normalized.length > 50) {
      throw new BadGatewayException(
        'SHAAM returned an invalid allocation number',
      );
    }
    return normalized;
  }
}
