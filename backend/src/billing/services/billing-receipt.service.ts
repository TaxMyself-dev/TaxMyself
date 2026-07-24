import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/user.entity';
import { BusinessType, DocumentType } from 'src/enum';
import { DocumentsService } from 'src/documents/documents.service';
import { MailService } from 'src/mail/mail.service';
import { BillingEventService } from './billing-event.service';

/**
 * Identity of the business issuing a billing receipt. Passed in by the caller
 * (currently always Keepintax's own identity, resolved by
 * BillingIssuerConfigService) rather than cached inside this service — so
 * issuing receipts for other businesses later only requires changing what the
 * caller passes in, not this service.
 */
export interface ReceiptIssuer {
  systemUserId: string;
  issuerBusinessNumber: string;
  issuerBusinessType: BusinessType;
  issuerName: string;
  issuerPhone: string | null;
  issuerEmail: string | null;
  issuerAddress: string | null;
}

@Injectable()
export class BillingReceiptService {
  private readonly logger = new Logger(BillingReceiptService.name);

  constructor(
    private readonly documentsService: DocumentsService,
    private readonly mailService: MailService,
    private readonly billingEventService: BillingEventService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ─── Step 1: Create document row + DocLines + DocPayments ────────────────────

  async createReceiptForPayment(issuer: ReceiptIssuer, params: {
    firebaseId: string;
    subscriptionId: number;
    amountBeforeVatAgorot: number;
    vatAmountAgorot: number;
    amountIncludingVatAgorot: number;
    planName: string;
    cardcomDealNumber: string | null;
  }): Promise<{ receiptDocId: number; docNumber: string; generalDocIndex: string }> {
    const {
      firebaseId, subscriptionId,
      amountBeforeVatAgorot, vatAmountAgorot, amountIncludingVatAgorot,
      planName, cardcomDealNumber,
    } = params;

    const user = await this.userRepo.findOne({ where: { firebaseId } });
    if (!user) {
      throw new Error(`BillingReceiptService: user not found for firebaseId=${firebaseId}`);
    }

    const recipientName = `${user.fName ?? ''} ${user.lName ?? ''}`.trim() || 'לקוח';
    const recipientEmail = user.email ?? null;

    const result = await this.documentsService.createBillingSystemReceipt({
      systemUserId: issuer.systemUserId,
      issuerBusinessNumber: issuer.issuerBusinessNumber,
      issuerBusinessType: issuer.issuerBusinessType,
      recipientName,
      recipientEmail,
      amountBeforeVatAgorot,
      vatAmountAgorot,
      amountIncludingVatAgorot,
      planName,
      docDate: new Date(),
    });

    console.log(
      `Billing receipt document created: docId=${result.receiptDocId} docNumber=${result.docNumber} ` +
        `for firebaseId=${firebaseId} subscriptionId=${subscriptionId} ` +
        `dealNumber=${cardcomDealNumber ?? 'null'}`,
    );

    return result;
  }

  // ─── Step 2: Generate PDFs + upload to Firebase ──────────────────────────────

  async finalizeBillingReceiptPdfs(
    receiptDocId: number,
    issuer: ReceiptIssuer,
    customerFirebaseId?: string | null,
  ): Promise<void> {
    await this.documentsService.finalizeBillingReceipt({
      docId: receiptDocId,
      issuerName: issuer.issuerName,
      issuerPhone: issuer.issuerPhone,
      issuerEmail: issuer.issuerEmail,
      issuerAddress: issuer.issuerAddress,
      businessType: issuer.issuerBusinessType,
      customerFirebaseId,
    });

    console.log(`Billing receipt PDFs generated and uploaded: docId=${receiptDocId}`);
  }

  // ─── Step 3: Send email (self-contained — updates billing_event metadata) ────

  /**
   * Sends the receipt email for the given PAYMENT_SUCCESS billing event.
   *
   * Looks up the receipt document via the event's receiptDocId, downloads the
   * already-uploaded PDF from Firebase, and emails it to Documents.recipientEmail.
   *
   * On success: sets billing_event.receiptEmailSent = true.
   * On failure: patches billing_event.metadata.receiptEmail with attempt count
   *             and last error. receiptEmailSent stays false.
   *
   * Never throws — receipt creation is unaffected by email delivery outcome.
   */
  async sendReceiptEmailForPaymentEvent(
    paymentEventId: number,
    issuerName: string,
  ): Promise<{ sent: boolean; error?: string }> {
    try {
      const event = await this.billingEventService.findPaymentEventById(paymentEventId);

      if (!event?.receiptDocId) {
        this.logger.warn(
          `sendReceiptEmailForPaymentEvent: event ${paymentEventId} has no receiptDocId — skipping`,
        );
        return { sent: false, error: 'No receipt document linked to this event' };
      }

      const receipt = await this.documentsService.getBillingReceiptPdf(event.receiptDocId);

      if (!receipt.recipientEmail) {
        console.log(
          `Receipt email skipped — no recipient email on docId=${event.receiptDocId} ` +
            `paymentEventId=${paymentEventId}`,
        );
        return { sent: false };
      }

      const docTypeName = 'חשבונית מס קבלה';
      const attachmentName =
        `${receipt.docType}_${receipt.docNumber}_${receipt.generalDocIndex}.pdf`;
      const emailBody = [
        `שלום ${receipt.recipientName},`,
        '',
        `מצורף בזאת ${docTypeName} מספר ${receipt.docNumber}.`,
        '',
        'בברכה,',
        issuerName,
      ].join('\n');

      await this.mailService.sendMailWithAttachment(
        receipt.recipientEmail,
        `${docTypeName} #${receipt.docNumber}`,
        emailBody,
        receipt.buffer,
        attachmentName,
      );

      await this.billingEventService.markReceiptEmailSent(paymentEventId);

      console.log(
        `Receipt email sent: docId=${event.receiptDocId} paymentEventId=${paymentEventId} ` +
          `recipient=${receipt.recipientEmail}`,
      );
      return { sent: true };
    } catch (err) {
      const errorMessage = (err as Error).message ?? String(err);
      this.logger.error(
        `Receipt email failed: paymentEventId=${paymentEventId}: ${errorMessage}`,
        (err as Error).stack,
      );
      await this.billingEventService.incrementReceiptEmailFailure(paymentEventId, errorMessage);
      return { sent: false, error: errorMessage };
    }
  }
}
