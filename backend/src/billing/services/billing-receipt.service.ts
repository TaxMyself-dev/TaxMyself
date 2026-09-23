import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/user.entity';
import { BusinessType, DocumentType } from 'src/enum';
import { DocumentsService } from 'src/documents/documents.service';
import { MailService } from 'src/mail/mail.service';
import { BillingEventService } from './billing-event.service';
import { BillingEventType } from '../enums/billing.enums';

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

function isDuplicateKeyError(error: unknown): boolean {
  const e = error as {
    code?: string;
    driverError?: { code?: string };
    response?: unknown;
    message?: string;
  };
  return (
    e?.code === 'ER_DUP_ENTRY' ||
    e?.driverError?.code === 'ER_DUP_ENTRY' ||
    // saveDocInfo re-wraps driver errors in an HttpException carrying the message.
    /ER_DUP_ENTRY|Duplicate entry/i.test(String(e?.message ?? ''))
  );
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
    periodStart: Date;
    periodEnd: Date;
    cardcomDealNumber: string | null;
    /**
     * Canonical attempt this receipt settles. When set, creation is idempotent:
     * an existing receipt for the attempt is returned instead of issuing a
     * second tax document and journal entry (backed by the UNIQUE
     * documents.billing_attempt_id key).
     */
    billingAttemptId?: number | null;
  }): Promise<{ receiptDocId: number; docNumber: string; generalDocIndex: string }> {
    const {
      firebaseId, subscriptionId,
      amountBeforeVatAgorot, vatAmountAgorot, amountIncludingVatAgorot,
      planName, periodStart, periodEnd, cardcomDealNumber, billingAttemptId,
    } = params;

    if (billingAttemptId != null) {
      const existing = await this.documentsService.findBillingReceiptByAttemptId(billingAttemptId);
      if (existing) {
        this.logger.log(
          `Billing receipt already exists for attemptId=${billingAttemptId}: docId=${existing.receiptDocId} — reusing`,
        );
        return existing;
      }
    }

    const user = await this.userRepo.findOne({ where: { firebaseId } });
    if (!user) {
      throw new Error(`BillingReceiptService: user not found for firebaseId=${firebaseId}`);
    }

    const recipientName = `${user.fName ?? ''} ${user.lName ?? ''}`.trim() || 'לקוח';
    const recipientEmail = user.email ?? null;

    let result: { receiptDocId: number; docNumber: string; generalDocIndex: string };
    try {
      result = await this.documentsService.createBillingSystemReceipt({
        systemUserId: issuer.systemUserId,
        issuerBusinessNumber: issuer.issuerBusinessNumber,
        issuerBusinessType: issuer.issuerBusinessType,
        recipientName,
        recipientEmail,
        amountBeforeVatAgorot,
        vatAmountAgorot,
        amountIncludingVatAgorot,
        planName,
        periodStart,
        periodEnd,
        docDate: new Date(),
        billingAttemptId,
      });
    } catch (error) {
      // A concurrent creator won the UNIQUE billing_attempt_id key. Its whole
      // createDoc transaction (document + journal) is committed, ours rolled
      // back — adopt the winner instead of failing or duplicating.
      if (billingAttemptId != null && isDuplicateKeyError(error)) {
        const winner = await this.documentsService.findBillingReceiptByAttemptId(billingAttemptId);
        if (winner) return winner;
      }
      throw error;
    }

    console.log(
      `Billing receipt document created: docId=${result.receiptDocId} docNumber=${result.docNumber} ` +
        `for firebaseId=${firebaseId} subscriptionId=${subscriptionId} ` +
        `dealNumber=${cardcomDealNumber ?? 'null'}`,
    );

    return result;
  }

  // ─── Idempotent post-capture receipt for a canonical attempt ─────────────────

  /**
   * The single post-capture receipt implementation for canonical attempts
   * (renewal and hosted recovery). Safe to call repeatedly for the same
   * CAPTURED attempt after any partial failure:
   *
   *   - success event: re-uses the attempt's existing PAYMENT/RENEWAL_SUCCESS
   *     row (found by billing_attempt_id) instead of logging another;
   *   - receipt document + journal entry: created at most once per attempt
   *     (UNIQUE documents.billing_attempt_id; createDoc persists both in one
   *     transaction), re-found on retry;
   *   - PDFs: finalizeBillingReceipt is itself idempotent;
   *   - email: skipped once receiptEmailSent is set.
   *
   * Amounts come from the attempt's immutable snapshot — what was actually
   * charged — never from a re-derived price. Throws on any failed step so the
   * caller keeps the attempt CAPTURED and retries later.
   */
  async ensureReceiptForCapturedAttempt(params: {
    issuer: ReceiptIssuer;
    eventType: BillingEventType.PAYMENT_SUCCESS | BillingEventType.RENEWAL_SUCCESS;
    attempt: {
      id: number;
      amountAgorot: number;
      amountBeforeVatAgorot: number;
      vatAmountAgorot: number;
      currency: string;
      cardcomTransactionId: string | null;
    };
    firebaseId: string;
    subscriptionId: number;
    planName: string;
    periodStart: Date;
    periodEnd: Date;
    eventMetadata?: Record<string, any>;
  }): Promise<{ receiptDocId: number }> {
    const {
      issuer, eventType, attempt, firebaseId, subscriptionId,
      planName, periodStart, periodEnd, eventMetadata,
    } = params;
    const cardcomDealNumber = attempt.cardcomTransactionId;

    let event = await this.billingEventService.findSuccessEventForAttempt(attempt.id, eventType);
    if (!event) {
      event = await this.billingEventService.logEvent({
        firebaseId,
        eventType,
        subscriptionId,
        amountAgorot: attempt.amountAgorot,
        amountBeforeVatAgorot: attempt.amountBeforeVatAgorot,
        vatAmountAgorot: attempt.vatAmountAgorot,
        currency: attempt.currency,
        cardcomDealNumber,
        billingAttemptId: attempt.id,
        metadata: { ...(eventMetadata ?? {}), attemptId: attempt.id, cardcomTransactionId: cardcomDealNumber },
      });
    }

    let receiptDocId = event?.receiptDocId ?? null;
    if (receiptDocId == null) {
      const receipt = await this.createReceiptForPayment(issuer, {
        firebaseId,
        subscriptionId,
        amountBeforeVatAgorot: attempt.amountBeforeVatAgorot,
        vatAmountAgorot: attempt.vatAmountAgorot,
        amountIncludingVatAgorot: attempt.amountAgorot,
        planName,
        periodStart,
        periodEnd,
        cardcomDealNumber,
        billingAttemptId: attempt.id,
      });
      receiptDocId = receipt.receiptDocId;
      if (event) await this.billingEventService.updatePaymentEventWithReceipt(event.id, receiptDocId);
    }

    await this.finalizeBillingReceiptPdfs(receiptDocId, issuer, firebaseId);
    if (event && !event.receiptEmailSent) {
      await this.sendReceiptEmailForPaymentEvent(event.id, issuer.issuerName);
    }
    return { receiptDocId };
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
