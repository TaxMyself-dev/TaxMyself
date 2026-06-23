import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/user.entity';
import { BusinessType, DocumentType } from 'src/enum';
import { DocumentsService } from 'src/documents/documents.service';
import { MailService } from 'src/mail/mail.service';
import { BillingEventService } from './billing-event.service';

@Injectable()
export class BillingReceiptService implements OnModuleInit {
  private readonly logger = new Logger(BillingReceiptService.name);

  private systemUserId: string;
  private issuerBusinessNumber: string;
  private issuerBusinessType: BusinessType;
  private issuerName: string;
  private issuerPhone: string | null;
  private issuerEmail: string | null;
  private issuerAddress: string | null;
  private initialReceiptIndex: number;

  constructor(
    private readonly documentsService: DocumentsService,
    private readonly mailService: MailService,
    private readonly billingEventService: BillingEventService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  onModuleInit(): void {
    const systemUserId = process.env.COMPANY_BILLING_FIREBASE_ID;
    const issuerBusinessNumber = process.env.COMPANY_BILLING_BUSINESS_NUMBER;
    const issuerName = process.env.COMPANY_BILLING_NAME;

    const missing = [
      !systemUserId && 'COMPANY_BILLING_FIREBASE_ID',
      !issuerBusinessNumber && 'COMPANY_BILLING_BUSINESS_NUMBER',
      !issuerName && 'COMPANY_BILLING_NAME',
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new Error(
        `BillingReceiptService: missing required env vars: ${missing.join(', ')}`,
      );
    }

    this.systemUserId = systemUserId!;
    this.issuerBusinessNumber = issuerBusinessNumber!;
    this.issuerName = issuerName!;
    this.issuerBusinessType =
      (process.env.COMPANY_BILLING_BUSINESS_TYPE as BusinessType) ?? BusinessType.LIMITED_COMPANY;
    this.issuerPhone = process.env.COMPANY_BILLING_PHONE || null;
    this.issuerEmail = process.env.COMPANY_BILLING_EMAIL || null;
    this.issuerAddress = process.env.COMPANY_BILLING_ADDRESS || null;
    this.initialReceiptIndex = parseInt(
      process.env.COMPANY_BILLING_RECEIPT_INITIAL_INDEX ?? '1',
      10,
    );
  }

  // ─── Step 1: Create document row + DocLines + DocPayments ────────────────────

  async createReceiptForPayment(params: {
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
      systemUserId: this.systemUserId,
      issuerBusinessNumber: this.issuerBusinessNumber,
      issuerBusinessType: this.issuerBusinessType,
      recipientName,
      recipientEmail,
      amountBeforeVatAgorot,
      vatAmountAgorot,
      amountIncludingVatAgorot,
      planName,
      docDate: new Date(),
      initialReceiptIndex: this.initialReceiptIndex,
    });

    this.logger.log(
      `Billing receipt document created: docId=${result.receiptDocId} docNumber=${result.docNumber} ` +
        `for firebaseId=${firebaseId} subscriptionId=${subscriptionId} ` +
        `dealNumber=${cardcomDealNumber ?? 'null'}`,
    );

    return result;
  }

  // ─── Step 2: Generate PDFs + upload to Firebase ──────────────────────────────

  async finalizeBillingReceiptPdfs(receiptDocId: number, customerFirebaseId?: string | null): Promise<void> {
    await this.documentsService.finalizeBillingReceipt({
      docId: receiptDocId,
      issuerName: this.issuerName,
      issuerPhone: this.issuerPhone,
      issuerEmail: this.issuerEmail,
      issuerAddress: this.issuerAddress,
      businessType: this.issuerBusinessType,
      customerFirebaseId,
    });

    this.logger.log(`Billing receipt PDFs generated and uploaded: docId=${receiptDocId}`);
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
        this.logger.log(
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
        this.issuerName,
      ].join('\n');

      await this.mailService.sendMailWithAttachment(
        receipt.recipientEmail,
        `${docTypeName} #${receipt.docNumber}`,
        emailBody,
        receipt.buffer,
        attachmentName,
      );

      await this.billingEventService.markReceiptEmailSent(paymentEventId);

      this.logger.log(
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
