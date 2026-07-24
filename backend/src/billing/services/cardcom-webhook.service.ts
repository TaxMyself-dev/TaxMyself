import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { encryptCardcomToken } from '../utils/billing-token-encryption.util';

import { BillingEvent } from '../entities/billing-event.entity';
import { CardcomWebhookLog } from '../entities/cardcom-webhook-log.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { User } from 'src/users/user.entity';

import {
  BillingEventType,
  SubscriptionStatus,
  WebhookLogStatus,
} from '../enums/billing.enums';
import { CardcomService } from './cardcom.service';
import { BillingEventService } from './billing-event.service';
import { BillingReceiptService } from './billing-receipt.service';
import { BillingIssuerConfigService } from './billing-issuer-config.service';
import { ModuleName } from 'src/enum';

// ── Swagger-verified field names from LowProfileResult / TransactionInfo / TokenInfo ─

interface CardcomWebhookPayload {
  ResponseCode?: number;
  Description?: string;
  TerminalNumber?: number;
  LowProfileId?: string;
  TranzactionId?: number;
  ReturnValue?: string;
  Operation?: string;
  DocumentInfo?: {
    ResponseCode?: number;
    DocumentType?: string;
    DocumentNumber?: number;
    DocumentUrl?: string;
  };
  TokenInfo?: {
    Token?: string;
    TokenExDate?: string;
    CardYear?: number;
    CardMonth?: number;
    TokenApprovalNumber?: string;
    CardOwnerIdentityNumber?: string;
  };
  TranzactionInfo?: {
    ResponseCode?: number;
    Description?: string;
    TranzactionId?: number;
    Amount?: number;
    Last4CardDigits?: number;
    Last4CardDigitsString?: string;
    Token?: string;
    CardName?: string;
    Brand?: string;
    CardMonth?: number;
    CardYear?: number;
    DocumentNumber?: number;
    DocumentType?: string;
    DocumentUrl?: string;
  };
}

interface ParsedReturnValue {
  firebaseId: string;
  planId: number;
  subscriptionId: number;
}

@Injectable()
export class CardcomWebhookService implements OnModuleInit {
  private readonly logger = new Logger(CardcomWebhookService.name);

  constructor(
    @InjectRepository(CardcomWebhookLog)
    private readonly webhookLogRepo: Repository<CardcomWebhookLog>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepo: Repository<PaymentMethod>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly cardcomService: CardcomService,
    private readonly billingEventService: BillingEventService,
    private readonly billingReceiptService: BillingReceiptService,
    private readonly billingIssuerConfigService: BillingIssuerConfigService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Startup validation ───────────────────────────────────────────────────

  onModuleInit(): void {
    if (!process.env.BILLING_TOKEN_ENCRYPTION_KEY) {
      throw new Error(
        'CardcomWebhookService: BILLING_TOKEN_ENCRYPTION_KEY is not set. ' +
          'CardCom tokens cannot be stored securely without it.',
      );
    }
    try {
      encryptCardcomToken('startup-validation-probe');
    } catch (err) {
      throw new Error(
        `CardcomWebhookService: BILLING_TOKEN_ENCRYPTION_KEY is invalid — ${(err as Error).message}`,
      );
    }
  }

  // ─── Main entry point ─────────────────────────────────────────────────────

  async handleWebhook(rawPayload: Record<string, any>): Promise<void> {
    const payload = rawPayload as CardcomWebhookPayload;

    const idempotencyKey = this.buildIdempotencyKey(payload);
    const lowProfileId = this.extractLowProfileId(payload);
    const returnValue = this.extractReturnValue(payload);

    // Parse ReturnValue JSON to extract routing context
    const parsedReturn = this.parseReturnValue(returnValue);

    const responseCode = payload.ResponseCode ?? null;
    const transactionId =
      payload.TranzactionId ?? payload.TranzactionInfo?.TranzactionId ?? null;

    console.log(
      `Webhook received: lowProfileId=${lowProfileId ?? 'none'} ` +
        `subscriptionId=${parsedReturn?.subscriptionId ?? 'none'} ` +
        `idempotencyKey=${idempotencyKey.slice(0, 24)}...`,
    );

    // ── Save webhook log (idempotency gate) ───────────────────────────────────
    const webhookLog = await this.saveWebhookLog(
      rawPayload,
      idempotencyKey,
      lowProfileId,
      parsedReturn?.firebaseId ?? null,
      parsedReturn?.planId ?? null,
      parsedReturn?.subscriptionId ?? null,
      transactionId != null ? String(transactionId) : null,
      responseCode,
    );

    if (!webhookLog) {
      console.log(`Duplicate webhook ignored: idempotencyKey=${idempotencyKey}`);
      return;
    }

    // ── Validate ReturnValue ───────────────────────────────────────────────────
    if (!parsedReturn) {
      this.logger.warn(
        `Webhook ReturnValue invalid or missing: ${returnValue?.slice(0, 100) ?? 'null'}`,
      );
      await this.markWebhookStatus(
        webhookLog.id,
        WebhookLogStatus.IGNORED,
        'ReturnValue missing or not valid routing JSON',
      );
      return;
    }

    const { firebaseId, planId, subscriptionId } = parsedReturn;

    // ── Require LowProfileId for GetLpResult verification ────────────────────
    if (!lowProfileId) {
      this.logger.error(
        `Webhook has no LowProfileId — cannot verify payment. subscriptionId=${subscriptionId}`,
      );
      await this.markWebhookStatus(
        webhookLog.id,
        WebhookLogStatus.FAILED,
        'No LowProfileId for verification',
      );
      return;
    }

    // ── Verify payment independently via GetLpResult ──────────────────────────
    let verifiedResult: Record<string, any>;
    try {
      verifiedResult = await this.cardcomService.getLowProfileResult(lowProfileId);
    } catch (err) {
      this.logger.error(
        `GetLpResult failed for subscriptionId=${subscriptionId}: ${(err as Error).message}`,
      );
      await this.markWebhookStatus(
        webhookLog.id,
        WebhookLogStatus.FAILED,
        `GetLpResult error: ${(err as Error).message}`,
      );
      return;
    }

    const verified = verifiedResult as CardcomWebhookPayload;

    // A successful payment requires ResponseCode=0 at the top level AND
    // at the TranzactionInfo level (if present).
    const topLevelOk = (verified.ResponseCode ?? -1) === 0;
    const txOk =
      !verified.TranzactionInfo ||
      (verified.TranzactionInfo.ResponseCode ?? -1) === 0;

    // Verify ReturnValue in GetLpResult matches what we originally sent.
    const verifiedReturnMatch =
      !verified.ReturnValue || verified.ReturnValue === returnValue;

    if (topLevelOk && txOk && verifiedReturnMatch) {
      await this.processVerifiedSuccess(
        firebaseId,
        planId,
        subscriptionId,
        verified,
        webhookLog,
      );
    } else {
      const reason = !topLevelOk
        ? `ResponseCode=${verified.ResponseCode ?? 'missing'} desc=${verified.Description ?? ''}`
        : !txOk
          ? `TranzactionInfo.ResponseCode=${verified.TranzactionInfo?.ResponseCode}`
          : 'ReturnValue mismatch';
      await this.processVerifiedFailure(firebaseId, subscriptionId, webhookLog, reason);
    }
  }

  // ─── Success path ─────────────────────────────────────────────────────────

  private async processVerifiedSuccess(
    firebaseId: string,
    planId: number,
    subscriptionId: number,
    verified: CardcomWebhookPayload,
    webhookLog: CardcomWebhookLog,
  ): Promise<void> {
    // Values extracted during the transaction and needed after commit.
    let postCommitData: {
      planName: string;
      planSlug: string;
      planModules: ModuleName[];
      periodEnd: Date;
      chargedAmountAgorot: number | null;
      cardcomDealNumber: string | null;
    } | null = null;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Lock subscription row to guard against concurrent webhook processing.
      const subscription = await qr.manager.findOne(Subscription, {
        where: { id: subscriptionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!subscription) {
        await qr.rollbackTransaction();
        this.logger.error(
          `Subscription #${subscriptionId} not found — cannot activate`,
        );
        await this.markWebhookStatus(
          webhookLog.id,
          WebhookLogStatus.FAILED,
          `Subscription ${subscriptionId} not found`,
        );
        return;
      }

      // Integrity check: firebaseId in ReturnValue must match the subscription row.
      if (subscription.firebaseId !== firebaseId) {
        await qr.rollbackTransaction();
        this.logger.error(
          `Subscription #${subscriptionId} firebaseId mismatch — ReturnValue=${firebaseId} DB=${subscription.firebaseId}`,
        );
        await this.markWebhookStatus(
          webhookLog.id,
          WebhookLogStatus.FAILED,
          'firebaseId mismatch on subscription',
        );
        return;
      }

      // Idempotency: subscription already activated for this plan — skip re-activation.
      if (
        subscription.status === SubscriptionStatus.ACTIVE &&
        subscription.planId === planId
      ) {
        await qr.rollbackTransaction();
        console.log(
          `Subscription #${subscriptionId} already ACTIVE on plan ${planId} — skipping`,
        );
        await this.markWebhookStatus(
          webhookLog.id,
          WebhookLogStatus.IGNORED,
          'Subscription already active on this plan',
        );
        // CardCom already verified a real, successful charge (we only reach
        // this branch after GetLpResult confirmed it) — log it even though we
        // take no other action, so a real charge is never invisible in the
        // audit trail just because it happened to be a no-op internally.
        const duplicateTranzactionId =
          verified.TranzactionId ?? verified.TranzactionInfo?.TranzactionId ?? null;
        const duplicateAmountAgorot =
          verified.TranzactionInfo?.Amount != null
            ? Math.round(verified.TranzactionInfo.Amount * 100)
            : null;
        await this.billingEventService.logEvent({
          firebaseId,
          eventType: BillingEventType.DUPLICATE_PAYMENT_IGNORED,
          subscriptionId,
          amountAgorot: duplicateAmountAgorot,
          currency: 'ILS',
          cardcomDealNumber: duplicateTranzactionId != null ? String(duplicateTranzactionId) : null,
          metadata: {
            planId,
            lowProfileId: verified.LowProfileId ?? null,
            reason: 'Subscription already active on this plan',
          },
        });
        return;
      }

      const plan = await qr.manager.findOneOrFail(SubscriptionPlan, {
        where: { id: planId },
      });

      const now = new Date();

      // ── 1. Extract token and card info ─────────────────────────────────────
      const token =
        verified.TokenInfo?.Token ?? verified.TranzactionInfo?.Token ?? null;
      const last4 =
        verified.TranzactionInfo?.Last4CardDigitsString ??
        (verified.TranzactionInfo?.Last4CardDigits != null
          ? String(verified.TranzactionInfo.Last4CardDigits).padStart(4, '0')
          : null);
      const cardBrand =
        verified.TranzactionInfo?.Brand ?? verified.TranzactionInfo?.CardName ?? null;

      if (!token) {
        this.logger.warn(
          `Subscription #${subscriptionId} — payment succeeded but no token in GetLpResult. ` +
            `Monthly renewal will not be possible until a token is stored.`,
        );
      }

      // ── 2. Create or update payment_method ────────────────────────────────
      const cardExpiryMonth =
        verified.TokenInfo?.CardMonth ?? verified.TranzactionInfo?.CardMonth ?? null;
      const cardExpiryYear =
        verified.TokenInfo?.CardYear ?? verified.TranzactionInfo?.CardYear ?? null;

      let paymentMethod: PaymentMethod | null = null;
      if (token) {
        const encryptedToken = encryptCardcomToken(token);
        if (subscription.paymentMethodId != null) {
          // Subscription already has a payment method — update it in place.
          paymentMethod = await qr.manager.findOneOrFail(PaymentMethod, {
            where: { id: subscription.paymentMethodId },
          });
          paymentMethod.cardcomToken = encryptedToken;
          paymentMethod.last4 = last4;
          paymentMethod.cardBrand = typeof cardBrand === 'string' ? cardBrand : null;
          paymentMethod.cardExpiryMonth = cardExpiryMonth;
          paymentMethod.cardExpiryYear = cardExpiryYear;
          paymentMethod = await qr.manager.save(PaymentMethod, paymentMethod);
        } else {
          paymentMethod = qr.manager.create(PaymentMethod, {
            firebaseId,
            cardcomToken: encryptedToken,
            last4,
            cardBrand: typeof cardBrand === 'string' ? cardBrand : null,
            cardExpiryMonth,
            cardExpiryYear,
          });
          paymentMethod = await qr.manager.save(PaymentMethod, paymentMethod);
        }
      }

      // ── 3. Extract transaction refs ───────────────────────────────────────
      const tranzactionId =
        verified.TranzactionId ?? verified.TranzactionInfo?.TranzactionId ?? null;
      const cardcomDealNumber = tranzactionId != null ? String(tranzactionId) : null;

      // TranzactionInfo.Amount is in NIS (shekels); convert to agorot for storage.
      const chargedAmountAgorot =
        verified.TranzactionInfo?.Amount != null
          ? Math.round(verified.TranzactionInfo.Amount * 100)
          : null;

      // ── 4. Activate subscription ──────────────────────────────────────────
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await qr.manager.update(Subscription, subscription.id, {
        status: SubscriptionStatus.ACTIVE,
        planId,
        paymentMethodId: paymentMethod?.id ?? subscription.paymentMethodId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
        gracePeriodEndsAt: null,
        canceledAt: null,
        endedAt: null,
      });

      await qr.commitTransaction();

      // Capture context needed post-commit — only set when commit succeeds.
      postCommitData = {
        planName: plan.name,
        planSlug: plan.slug,
        planModules: (plan.modules ?? Object.values(ModuleName)) as ModuleName[],
        periodEnd,
        chargedAmountAgorot,
        cardcomDealNumber,
      };
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Transaction failed for subscription #${subscriptionId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.markWebhookStatus(
        webhookLog.id,
        WebhookLogStatus.FAILED,
        `Transaction error: ${(err as Error).message}`,
      );
      // Do not re-throw — we must return 200 to CardCom.
    } finally {
      await qr.release();
    }

    // Only proceed if the DB transaction committed successfully.
    if (!postCommitData) return;

    const { planName, planSlug, planModules, periodEnd, chargedAmountAgorot, cardcomDealNumber } =
      postCommitData;

    // ── 5. Mark webhook processed ─────────────────────────────────────────
    await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.PROCESSED);

    // ── 6. Billing events (fire-and-forget, outside transaction) ─────────
    await this.billingEventService.logEvent({
      firebaseId,
      eventType: BillingEventType.WEBHOOK_RECEIVED,
      subscriptionId,
      metadata: { idempotencyKey: webhookLog.idempotencyKey },
    });
    await this.billingEventService.logEvent({
      firebaseId,
      eventType: BillingEventType.PAYMENT_VERIFIED,
      subscriptionId,
      amountAgorot: chargedAmountAgorot,
      currency: 'ILS',
      metadata: { lowProfileId: verified.LowProfileId },
    });
    const paymentSuccessEvent = await this.billingEventService.logEvent({
      firebaseId,
      eventType: BillingEventType.PAYMENT_SUCCESS,
      subscriptionId,
      amountAgorot: chargedAmountAgorot,
      currency: 'ILS',
      cardcomDealNumber,
      metadata: { planId },
    });
    await this.billingEventService.logEvent({
      firebaseId,
      eventType: BillingEventType.SUBSCRIPTION_ACTIVATED,
      subscriptionId,
      metadata: {
        planId,
        planSlug,
        currentPeriodEnd: periodEnd.toISOString(),
      },
    });

    console.log(
      `Payment processed: subscription #${subscriptionId} ACTIVE, plan=${planSlug}`,
    );

    // ── 8. Generate receipt (outside transaction — never affects payment) ─
    await this.generateReceiptAfterPayment({
      firebaseId,
      subscriptionId,
      planName,
      cardcomDealNumber,
      paymentSuccessEvent,
    });
  }

  // ─── Receipt generation ───────────────────────────────────────────────────

  private async generateReceiptAfterPayment(params: {
    firebaseId: string;
    subscriptionId: number;
    planName: string;
    cardcomDealNumber: string | null;
    paymentSuccessEvent: BillingEvent | null;
  }): Promise<void> {
    const { firebaseId, subscriptionId, planName, cardcomDealNumber, paymentSuccessEvent } = params;

    console.log(
      `Receipt generation started: subscriptionId=${subscriptionId} dealNumber=${cardcomDealNumber ?? 'null'}`,
    );

    try {
      // 1. Verify the PAYMENT_SUCCESS event was persisted — needed to link the receipt.
      if (!paymentSuccessEvent) {
        this.logger.error(
          `Receipt generation failed: PAYMENT_SUCCESS event failed to persist for ` +
            `subscriptionId=${subscriptionId} dealNumber=${cardcomDealNumber ?? 'null'}`,
        );
        await this.billingEventService.logEvent({
          firebaseId,
          eventType: BillingEventType.RECEIPT_FAILED,
          subscriptionId,
          metadata: {
            reason: 'PAYMENT_SUCCESS event failed to persist',
            cardcomDealNumber,
          },
        });
        return;
      }

      // 2. Idempotency: receipt was already created for this payment event.
      if (paymentSuccessEvent.receiptDocId != null) {
        console.log(
          `Receipt generation skipped — already exists: receiptDocId=${paymentSuccessEvent.receiptDocId} ` +
            `subscriptionId=${subscriptionId}`,
        );
        return;
      }

      // 3. Retrieve canonical VAT breakdown from CHECKOUT_CREATED — never recalculate.
      const breakdown = await this.billingEventService.findCheckoutBreakdown(subscriptionId);

      if (!breakdown) {
        this.logger.error(
          `Receipt generation failed: no CHECKOUT_CREATED breakdown found for ` +
            `subscriptionId=${subscriptionId}. Cannot create receipt without canonical VAT amounts.`,
        );
        await this.billingEventService.logEvent({
          firebaseId,
          eventType: BillingEventType.RECEIPT_FAILED,
          subscriptionId,
          metadata: {
            reason: 'CHECKOUT_CREATED VAT breakdown not found',
            cardcomDealNumber,
          },
        });
        return;
      }

      // 3b. Resolve the issuer identity for this receipt. Always Keepintax today —
      // this is the seam to change once other businesses can charge via CardCom.
      const issuer = await this.billingIssuerConfigService.getKeepintaxIssuer();

      // 4. Create the TAX_INVOICE_RECEIPT document (DB rows only — no PDF yet).
      const receipt = await this.billingReceiptService.createReceiptForPayment(issuer, {
        firebaseId,
        subscriptionId,
        amountBeforeVatAgorot: breakdown.amountBeforeVatAgorot,
        vatAmountAgorot: breakdown.vatAmountAgorot,
        amountIncludingVatAgorot: breakdown.amountIncludingVatAgorot,
        planName,
        cardcomDealNumber,
      });

      // 5. Link receipt to PAYMENT_SUCCESS — idempotency anchor for subsequent steps.
      await this.billingEventService.updatePaymentEventWithReceipt(
        paymentSuccessEvent.id,
        receipt.receiptDocId,
      );

      // 6. Generate PDFs and upload to Firebase (original + copy).
      await this.billingReceiptService.finalizeBillingReceiptPdfs(receipt.receiptDocId, issuer, firebaseId);

      // 7. Send receipt email (self-contained — updates metadata on failure, never throws).
      await this.billingReceiptService.sendReceiptEmailForPaymentEvent(paymentSuccessEvent.id, issuer.issuerName);

      console.log(
        `Receipt lifecycle complete: receiptDocId=${receipt.receiptDocId} ` +
          `docNumber=${receipt.docNumber} subscriptionId=${subscriptionId} ` +
          `dealNumber=${cardcomDealNumber ?? 'null'}`,
      );
    } catch (err) {
      // Receipt failure must never affect the subscription or payment result.
      this.logger.error(
        `Receipt generation failed for subscriptionId=${subscriptionId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.billingEventService.logEvent({
        firebaseId,
        eventType: BillingEventType.RECEIPT_FAILED,
        subscriptionId,
        metadata: {
          error: (err as Error).message,
          stack: (err as Error).stack,
          cardcomDealNumber,
        },
      });
    }
  }

  // ─── Failure path ─────────────────────────────────────────────────────────

  private async processVerifiedFailure(
    firebaseId: string,
    subscriptionId: number,
    webhookLog: CardcomWebhookLog,
    reason: string,
  ): Promise<void> {
    this.logger.warn(`Payment failed for subscription #${subscriptionId}: ${reason}`);

    await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.PROCESSED, reason);

    await this.billingEventService.logEvent({
      firebaseId,
      eventType: BillingEventType.PAYMENT_FAILED,
      subscriptionId,
      currency: 'ILS',
      metadata: { reason },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Idempotency key strategy (in order of preference):
   * 1. LowProfileId + TranzactionId  — most specific, both come from CardCom
   * 2. LowProfileId + ReturnValue    — LowProfileId alone; ReturnValue disambiguates retries
   * 3. SHA256(stable JSON)           — last resort for unstructured payloads
   */
  buildIdempotencyKey(payload: CardcomWebhookPayload): string {
    const lp = payload.LowProfileId;
    const tx = payload.TranzactionId ?? payload.TranzactionInfo?.TranzactionId;

    if (lp && tx != null) return `${lp}:tx:${tx}`;
    if (lp && payload.ReturnValue) return `${lp}:rv:${payload.ReturnValue}`;

    const stable = JSON.stringify(payload, Object.keys(payload as object).sort());
    return `sha256:${crypto.createHash('sha256').update(stable).digest('hex')}`;
  }

  extractLowProfileId(payload: CardcomWebhookPayload): string | null {
    return payload.LowProfileId ?? null;
  }

  extractReturnValue(payload: CardcomWebhookPayload): string | null {
    return payload.ReturnValue ?? null;
  }

  /**
   * Parses ReturnValue JSON string into routing fields.
   * Returns null if the value is missing, not valid JSON, or lacks required fields.
   */
  private parseReturnValue(returnValue: string | null): ParsedReturnValue | null {
    if (!returnValue) return null;
    try {
      const raw = JSON.parse(returnValue);
      const { firebaseId, planId, subscriptionId } = raw;
      if (
        typeof firebaseId === 'string' &&
        firebaseId.length > 0 &&
        typeof planId === 'number' &&
        Number.isInteger(planId) &&
        planId > 0 &&
        typeof subscriptionId === 'number' &&
        Number.isInteger(subscriptionId) &&
        subscriptionId > 0
      ) {
        return { firebaseId, planId, subscriptionId };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Inserts a webhook log row with extracted routing fields.
   * Returns null if the idempotency key already exists (duplicate webhook).
   */
  private async saveWebhookLog(
    rawPayload: Record<string, any>,
    idempotencyKey: string,
    cardcomLowProfileId: string | null,
    firebaseId: string | null,
    planId: number | null,
    subscriptionId: number | null,
    cardcomTransactionId: string | null,
    responseCode: number | null,
  ): Promise<CardcomWebhookLog | null> {
    try {
      const log = this.webhookLogRepo.create({
        idempotencyKey,
        eventType: (rawPayload as CardcomWebhookPayload).Operation ?? null,
        payload: rawPayload,
        status: WebhookLogStatus.RECEIVED,
        receivedAt: new Date(),
        cardcomLowProfileId,
        firebaseId,
        planId,
        subscriptionId,
        cardcomTransactionId,
        responseCode,
      });
      return await this.webhookLogRepo.save(log);
    } catch (err: any) {
      // MySQL error 1062 = duplicate entry (unique constraint on idempotencyKey).
      if (err?.code === 'ER_DUP_ENTRY' || err?.driverError?.code === 'ER_DUP_ENTRY') {
        return null;
      }
      throw err;
    }
  }

  private async markWebhookStatus(
    logId: number,
    status: WebhookLogStatus,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.webhookLogRepo.update(logId, {
        status,
        processedAt: status !== WebhookLogStatus.RECEIVED ? new Date() : undefined,
        errorMessage: errorMessage ?? null,
      });
    } catch (err) {
      this.logger.error(
        `Failed to update webhook log #${logId} status: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Temporary bridge to keep legacy User fields in sync.
   * Best-effort — never throws.
   */

}
