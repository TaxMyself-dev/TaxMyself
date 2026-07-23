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

/**
 * Routing context echoed back from CardCom in ReturnValue.
 *   CHECKOUT   → paid checkout; activates the subscription (requires planId).
 *   CHANGE_PM  → replace saved card only; never charges/activates (no planId).
 * `intent` is REQUIRED. Payloads with a missing or unknown intent are rejected —
 * there is no legacy fallback to CHECKOUT.
 */
type ParsedReturnValue =
  | { intent: 'CHECKOUT'; firebaseId: string; planId: number; subscriptionId: number }
  | { intent: 'CHANGE_PM'; firebaseId: string; subscriptionId: number };

/** Card fields persisted onto payment_method after a verified CardCom result. */
interface CardDetails {
  token: string | null;
  last4: string | null;
  brand: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
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

    // Parse ReturnValue JSON to extract routing context (strict — intent required)
    const { value: parsedReturn, error: returnValueError } =
      this.parseReturnValue(returnValue);

    const responseCode = payload.ResponseCode ?? null;
    const transactionId =
      payload.TranzactionId ?? payload.TranzactionInfo?.TranzactionId ?? null;

    this.logger.log(
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
      parsedReturn?.intent === 'CHECKOUT' ? parsedReturn.planId : null,
      parsedReturn?.subscriptionId ?? null,
      transactionId != null ? String(transactionId) : null,
      responseCode,
    );

    if (!webhookLog) {
      this.logger.log(`Duplicate webhook ignored: idempotencyKey=${idempotencyKey}`);
      return;
    }

    // ── Validate ReturnValue (strict) ──────────────────────────────────────────
    // Payloads without a valid intent are rejected outright — no legacy fallback.
    if (!parsedReturn) {
      this.logger.error(
        `Webhook rejected — ${returnValueError}. ` +
          `lowProfileId=${lowProfileId ?? 'none'} ReturnValue=${returnValue?.slice(0, 100) ?? 'null'}`,
      );
      await this.markWebhookStatus(
        webhookLog.id,
        WebhookLogStatus.IGNORED,
        returnValueError ?? 'ReturnValue rejected',
      );
      return;
    }

    const { firebaseId, subscriptionId } = parsedReturn;

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

    const topLevelOk = (verified.ResponseCode ?? -1) === 0;

    // Verify ReturnValue in GetLpResult matches what we originally sent.
    const verifiedReturnMatch =
      !verified.ReturnValue || verified.ReturnValue === returnValue;

    // ── CHANGE_PM: replace saved card only — never charges/activates ──────────
    if (parsedReturn.intent === 'CHANGE_PM') {
      await this.applyVerifiedChangePaymentMethod(
        firebaseId,
        subscriptionId,
        verified,
        webhookLog,
        returnValue,
      );
      return;
    }

    // ── CHECKOUT: full activation flow ────────────────────────────────────────
    // A successful payment requires ResponseCode=0 at the top level AND
    // at the TranzactionInfo level (if present).
    const txOk =
      !verified.TranzactionInfo ||
      (verified.TranzactionInfo.ResponseCode ?? -1) === 0;

    if (topLevelOk && txOk && verifiedReturnMatch) {
      await this.processVerifiedSuccess(
        firebaseId,
        parsedReturn.planId,
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
      periodStart: Date;
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
        this.logger.log(
          `Subscription #${subscriptionId} already ACTIVE on plan ${planId} — skipping`,
        );
        await this.markWebhookStatus(
          webhookLog.id,
          WebhookLogStatus.IGNORED,
          'Subscription already active on this plan',
        );
        return;
      }

      const plan = await qr.manager.findOneOrFail(SubscriptionPlan, {
        where: { id: planId },
      });

      const now = new Date();

      // ── 1. Extract token and card info ─────────────────────────────────────
      const card = this.extractCardDetails(verified);

      if (!card.token) {
        this.logger.warn(
          `Subscription #${subscriptionId} — payment succeeded but no token in GetLpResult. ` +
            `Monthly renewal will not be possible until a token is stored.`,
        );
      }

      // ── 2. Create or update payment_method ────────────────────────────────
      let paymentMethod: PaymentMethod | null = null;
      if (card.token) {
        const encryptedToken = encryptCardcomToken(card.token);
        if (subscription.paymentMethodId != null) {
          // Subscription already has a payment method — update it in place.
          paymentMethod = await qr.manager.findOneOrFail(PaymentMethod, {
            where: { id: subscription.paymentMethodId },
          });
          paymentMethod.cardcomToken = encryptedToken;
          paymentMethod.last4 = card.last4;
          paymentMethod.cardBrand = card.brand;
          paymentMethod.cardExpiryMonth = card.expiryMonth;
          paymentMethod.cardExpiryYear = card.expiryYear;
          paymentMethod = await qr.manager.save(PaymentMethod, paymentMethod);
        } else {
          paymentMethod = qr.manager.create(PaymentMethod, {
            firebaseId,
            cardcomToken: encryptedToken,
            last4: card.last4,
            cardBrand: card.brand,
            cardExpiryMonth: card.expiryMonth,
            cardExpiryYear: card.expiryYear,
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
        periodStart: now,
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

    const { planName, planSlug, planModules, periodStart, periodEnd, chargedAmountAgorot, cardcomDealNumber } =
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

    this.logger.log(
      `Payment processed: subscription #${subscriptionId} ACTIVE, plan=${planSlug}`,
    );

    // ── 8. Generate receipt (outside transaction — never affects payment) ─
    await this.generateReceiptAfterPayment({
      firebaseId,
      subscriptionId,
      planName,
      periodStart,
      periodEnd,
      cardcomDealNumber,
      paymentSuccessEvent,
    });
  }

  // ─── Receipt generation ───────────────────────────────────────────────────

  private async generateReceiptAfterPayment(params: {
    firebaseId: string;
    subscriptionId: number;
    planName: string;
    periodStart: Date;
    periodEnd: Date;
    cardcomDealNumber: string | null;
    paymentSuccessEvent: BillingEvent | null;
  }): Promise<void> {
    const { firebaseId, subscriptionId, planName, periodStart, periodEnd, cardcomDealNumber, paymentSuccessEvent } = params;

    this.logger.log(
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
        this.logger.log(
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

      // 4. Create the TAX_INVOICE_RECEIPT document (DB rows only — no PDF yet).
      const receipt = await this.billingReceiptService.createReceiptForPayment({
        firebaseId,
        subscriptionId,
        amountBeforeVatAgorot: breakdown.amountBeforeVatAgorot,
        vatAmountAgorot: breakdown.vatAmountAgorot,
        amountIncludingVatAgorot: breakdown.amountIncludingVatAgorot,
        planName,
        periodStart,
        periodEnd,
        cardcomDealNumber,
      });

      // 5. Link receipt to PAYMENT_SUCCESS — idempotency anchor for subsequent steps.
      await this.billingEventService.updatePaymentEventWithReceipt(
        paymentSuccessEvent.id,
        receipt.receiptDocId,
      );

      // 6. Generate PDFs and upload to Firebase (original + copy).
      await this.billingReceiptService.finalizeBillingReceiptPdfs(receipt.receiptDocId, firebaseId);

      // 7. Send receipt email (self-contained — updates metadata on failure, never throws).
      await this.billingReceiptService.sendReceiptEmailForPaymentEvent(paymentSuccessEvent.id);

      this.logger.log(
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

  // ─── Card details extraction ────────────────────────────────────────────────

  /**
   * Official Mutag24 → brand mapping from the CardCom LowProfile docs
   * ("0 - Private card of an issuing company (PL), 1 - Mastercard, 2 - Visa,
   * 3 - Maestro, 5 - Isracard"); 4/6/7/8 follow the v11 Brand enum order
   * (AmericanExpress, Isracard, JBC, Discover, Diners). Used only when the
   * verified result carries no Brand/CardName.
   */
  private static readonly MUTAG_BRAND: Record<number, string> = {
    0: 'PrivateCard',
    1: 'MasterCard',
    2: 'Visa',
    3: 'Maestro',
    4: 'AmericanExpress',
    5: 'Isracard',
    6: 'JBC',
    7: 'Discover',
    8: 'Diners',
  };

  /**
   * Extracts token + card fields from a verified LowProfile result.
   * TokenInfo is the authoritative source for token/expiry (always populated for
   * ChargeAndCreateToken / CreateTokenOnly); last4/brand only exist on
   * TranzactionInfo, which the v11 spec guarantees for charge operations but
   * NOT for CreateTokenOnly — missing fields stay null (see completeCardDetails).
   */
  private extractCardDetails(verified: CardcomWebhookPayload): CardDetails {
    const brand =
      verified.TranzactionInfo?.Brand ?? verified.TranzactionInfo?.CardName ?? null;
    return {
      token: verified.TokenInfo?.Token ?? verified.TranzactionInfo?.Token ?? null,
      last4:
        verified.TranzactionInfo?.Last4CardDigitsString ??
        (verified.TranzactionInfo?.Last4CardDigits != null
          ? String(verified.TranzactionInfo.Last4CardDigits).padStart(4, '0')
          : null),
      brand: typeof brand === 'string' ? brand : null,
      expiryMonth:
        verified.TokenInfo?.CardMonth ?? verified.TranzactionInfo?.CardMonth ?? null,
      expiryYear:
        verified.TokenInfo?.CardYear ?? verified.TranzactionInfo?.CardYear ?? null,
    };
  }

  /**
   * Fills card fields the LowProfile result did not provide by calling
   * Transactions/GetTransactionInfoById with the J2 validation TranzactionId.
   * The returned ExtShvaParams carry the REAL card data of the new card:
   * CardNumber5 (last 4 digits), Mutag24/CardName (brand), Tokef30 (MMYY expiry).
   *
   * Best-effort: on any failure the original details are returned unchanged —
   * the token replacement itself must never be blocked by this lookup.
   * Values already present are never overwritten, and nothing is ever copied
   * from the previous payment method.
   */
  private async completeCardDetails(
    details: CardDetails,
    verified: CardcomWebhookPayload,
    subscriptionId: number,
  ): Promise<CardDetails> {
    const missing =
      !details.last4 ||
      !details.brand ||
      details.expiryMonth == null ||
      details.expiryYear == null;
    if (!missing) return details;

    const tranzactionId =
      verified.TranzactionId ?? verified.TranzactionInfo?.TranzactionId ?? null;
    if (tranzactionId == null) {
      this.logger.warn(
        `Card details incomplete for subscription #${subscriptionId} and no TranzactionId ` +
          `to query — storing partial card info (last4=${details.last4 ?? 'null'})`,
      );
      return details;
    }

    try {
      const rows = await this.cardcomService.getTransactionInfoById(tranzactionId);
      const row =
        rows.find(r => r?.InternalDealNumber === tranzactionId) ?? rows[0] ?? null;
      if (!row) {
        this.logger.warn(
          `GetTransactionInfoById returned no rows for tranzactionId=${tranzactionId} ` +
            `(subscription #${subscriptionId})`,
        );
        return details;
      }

      const completed: CardDetails = { ...details };

      if (!completed.last4 && row.CardNumber5 != null) {
        const digits = String(row.CardNumber5).replace(/\D/g, '');
        if (digits.length > 0) completed.last4 = digits.slice(-4).padStart(4, '0');
      }

      if (!completed.brand) {
        const mutag = row.Mutag24 != null ? Number(row.Mutag24) : NaN;
        completed.brand =
          CardcomWebhookService.MUTAG_BRAND[mutag] ??
          (typeof row.CardName === 'string' && row.CardName.length > 0
            ? row.CardName
            : null);
      }

      if (
        (completed.expiryMonth == null || completed.expiryYear == null) &&
        typeof row.Tokef30 === 'string' &&
        /^\d{4}$/.test(row.Tokef30)
      ) {
        // Tokef30 is MMYY, e.g. "1024" = 10/2024 (per CardCom's documented example).
        completed.expiryMonth ??= parseInt(row.Tokef30.slice(0, 2), 10);
        completed.expiryYear ??= 2000 + parseInt(row.Tokef30.slice(2), 10);
      }

      this.logger.log(
        `Card details completed via GetTransactionInfoById: subscription #${subscriptionId} ` +
          `last4=${completed.last4 ?? 'null'} brand=${completed.brand ?? 'null'}`,
      );
      return completed;
    } catch (err) {
      this.logger.warn(
        `GetTransactionInfoById failed for tranzactionId=${tranzactionId} ` +
          `(subscription #${subscriptionId}): ${(err as Error).message} — storing partial card info`,
      );
      return details;
    }
  }

  // ─── Change-payment-method path ─────────────────────────────────────────────

  /**
   * The single CHANGE_PM decision point, shared by the webhook and the
   * reconciliation fallback. Both arrive here with a result they fetched from
   * GetLpResult, so neither can apply looser rules than the other.
   *
   * CreateTokenOnly + J2 produces a validation transaction whose
   * TranzactionInfo.ResponseCode is 700/701 (NOT 0), so it is intentionally NOT
   * required. Success = top-level ResponseCode 0, ReturnValue match, AND a token.
   */
  private async applyVerifiedChangePaymentMethod(
    firebaseId: string,
    subscriptionId: number,
    verified: CardcomWebhookPayload,
    webhookLog: CardcomWebhookLog,
    returnValue: string | null,
  ): Promise<void> {
    const topLevelOk = (verified.ResponseCode ?? -1) === 0;
    const verifiedReturnMatch =
      !verified.ReturnValue || !returnValue || verified.ReturnValue === returnValue;
    const token = verified.TokenInfo?.Token ?? verified.TranzactionInfo?.Token ?? null;

    if (topLevelOk && verifiedReturnMatch && token) {
      await this.processVerifiedPaymentMethodUpdate(
        firebaseId,
        subscriptionId,
        verified,
        webhookLog,
      );
      return;
    }

    const reason = !topLevelOk
      ? `ResponseCode=${verified.ResponseCode ?? 'missing'} desc=${verified.Description ?? ''}`
      : !verifiedReturnMatch
        ? 'ReturnValue mismatch'
        : 'No token in verified result';

    await this.processVerifiedPaymentMethodUpdateFailure(
      firebaseId,
      subscriptionId,
      webhookLog,
      reason,
      verified.LowProfileId ?? null,
    );
  }

  /**
   * Reconciliation fallback for a CHANGE_PM attempt whose webhook never arrived
   * (the common cause in development is CARDCOM_WEBHOOK_BASE_URL pointing at a
   * dead tunnel — see backend/src/billing/CLAUDE.md).
   *
   * This does NOT bypass or weaken the webhook path: it pulls the same
   * GetLpResult, writes the same webhook-log row under the SAME idempotency key
   * the webhook would have used, and hands off to the same
   * applyVerifiedChangePaymentMethod. Consequences:
   *
   *   - If the webhook already processed this attempt, the log insert hits the
   *     unique idempotency key and returns null → we stop. No second token
   *     write, no duplicate events.
   *   - If reconciliation wins the race, a webhook arriving later is deduped by
   *     that very same row through the existing gate in handleWebhook.
   *
   * Ownership is enforced from the VERIFIED result's ReturnValue, not from the
   * caller's claim, so a user cannot reconcile someone else's LowProfileId.
   */
  async reconcileChangePaymentMethod(
    lowProfileId: string,
    expectedFirebaseId: string,
  ): Promise<'APPLIED' | 'ALREADY_PROCESSED' | 'UNVERIFIABLE'> {
    let verified: CardcomWebhookPayload;
    try {
      verified = (await this.cardcomService.getLowProfileResult(
        lowProfileId,
      )) as CardcomWebhookPayload;
    } catch (err) {
      // Transient gateway problem — stay PENDING so the next poll retries.
      this.logger.warn(
        `Reconciliation GetLpResult failed for lowProfileId=${lowProfileId}: ${(err as Error).message}`,
      );
      return 'UNVERIFIABLE';
    }

    const returnValue = verified.ReturnValue ?? null;
    const { value: parsedReturn, error: returnValueError } =
      this.parseReturnValue(returnValue);

    if (!parsedReturn || parsedReturn.intent !== 'CHANGE_PM') {
      this.logger.warn(
        `Reconciliation skipped for lowProfileId=${lowProfileId} — ` +
          `${returnValueError ?? 'ReturnValue is not a CHANGE_PM intent'}`,
      );
      return 'UNVERIFIABLE';
    }

    if (parsedReturn.firebaseId !== expectedFirebaseId) {
      this.logger.error(
        `Reconciliation ownership mismatch for lowProfileId=${lowProfileId} — ` +
          `caller=${expectedFirebaseId} ReturnValue=${parsedReturn.firebaseId}`,
      );
      return 'UNVERIFIABLE';
    }

    const transactionId =
      verified.TranzactionId ?? verified.TranzactionInfo?.TranzactionId ?? null;

    // Same key the webhook would compute for this attempt — that shared key IS
    // the mutual-exclusion mechanism between the two paths.
    const idempotencyKey = this.buildIdempotencyKey({
      LowProfileId: lowProfileId,
      TranzactionId: transactionId ?? undefined,
      ReturnValue: returnValue ?? undefined,
    });

    const webhookLog = await this.saveWebhookLog(
      verified as Record<string, any>,
      idempotencyKey,
      lowProfileId,
      parsedReturn.firebaseId,
      null,
      parsedReturn.subscriptionId,
      transactionId != null ? String(transactionId) : null,
      verified.ResponseCode ?? null,
      'RECONCILIATION',
    );

    if (!webhookLog) {
      this.logger.log(
        `Reconciliation no-op for lowProfileId=${lowProfileId} — already processed ` +
          `(idempotencyKey=${idempotencyKey.slice(0, 24)}...)`,
      );
      return 'ALREADY_PROCESSED';
    }

    this.logger.log(
      `Reconciling CHANGE_PM without webhook: lowProfileId=${lowProfileId} ` +
        `subscriptionId=${parsedReturn.subscriptionId}`,
    );

    await this.applyVerifiedChangePaymentMethod(
      parsedReturn.firebaseId,
      parsedReturn.subscriptionId,
      verified,
      webhookLog,
      returnValue,
    );

    return 'APPLIED';
  }

  /**
   * Replaces the subscription's saved CardCom token (CreateTokenOnly flow).
   *
   * This ONLY updates payment_method + subscription.paymentMethodId. It never:
   *   - activates the subscription or changes its status
   *   - modifies billing periods / nextBillingDate / plan
   *   - charges the customer or generates a receipt
   *   - emits PAYMENT_SUCCESS / PAYMENT_VERIFIED events
   *
   * Reuses the same token extraction + encryption + update-in-place logic as the
   * checkout activation flow. Card details come from TokenInfo/TranzactionInfo,
   * completed via GetTransactionInfoById when CreateTokenOnly omits last4/brand —
   * the old card's details are never carried over onto the new token.
   */
  private async processVerifiedPaymentMethodUpdate(
    firebaseId: string,
    subscriptionId: number,
    verified: CardcomWebhookPayload,
    webhookLog: CardcomWebhookLog,
  ): Promise<void> {
    // Resolve the full card details BEFORE opening the DB transaction — the
    // completion step is an HTTP call and must not run while holding a row lock.
    const extracted = this.extractCardDetails(verified);
    if (!extracted.token) {
      // Should not happen (handleWebhook already checked), but guard anyway.
      await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.FAILED, 'No token to store');
      await this.logPaymentMethodUpdateFailed(
        firebaseId,
        subscriptionId,
        'No token to store',
        verified.LowProfileId ?? null,
      );
      return;
    }
    const card = await this.completeCardDetails(extracted, verified, subscriptionId);

    let committedData: { paymentMethodId: number; last4: string | null; brand: string | null } | null =
      null;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const subscription = await qr.manager.findOne(Subscription, {
        where: { id: subscriptionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!subscription) {
        await qr.rollbackTransaction();
        this.logger.error(`Subscription #${subscriptionId} not found — cannot update payment method`);
        await this.markWebhookStatus(
          webhookLog.id,
          WebhookLogStatus.FAILED,
          `Subscription ${subscriptionId} not found`,
        );
        await this.logPaymentMethodUpdateFailed(
          firebaseId,
          subscriptionId,
          'Subscription not found',
          verified.LowProfileId ?? null,
        );
        return;
      }

      if (subscription.firebaseId !== firebaseId) {
        await qr.rollbackTransaction();
        this.logger.error(
          `Subscription #${subscriptionId} firebaseId mismatch on payment-method update`,
        );
        await this.markWebhookStatus(
          webhookLog.id,
          WebhookLogStatus.FAILED,
          'firebaseId mismatch on subscription',
        );
        await this.logPaymentMethodUpdateFailed(
          firebaseId,
          subscriptionId,
          'firebaseId mismatch',
          verified.LowProfileId ?? null,
        );
        return;
      }

      // ── Persist the new card (details resolved above, before the lock) ──────
      const encryptedToken = encryptCardcomToken(card.token!);

      let paymentMethod: PaymentMethod;
      if (subscription.paymentMethodId != null) {
        // Update the existing card in place.
        paymentMethod = await qr.manager.findOneOrFail(PaymentMethod, {
          where: { id: subscription.paymentMethodId },
        });
        paymentMethod.cardcomToken = encryptedToken;
        paymentMethod.last4 = card.last4;
        paymentMethod.cardBrand = card.brand;
        paymentMethod.cardExpiryMonth = card.expiryMonth;
        paymentMethod.cardExpiryYear = card.expiryYear;
        paymentMethod = await qr.manager.save(PaymentMethod, paymentMethod);
      } else {
        // No saved card yet — create one and link it (status/dates untouched).
        paymentMethod = qr.manager.create(PaymentMethod, {
          firebaseId,
          cardcomToken: encryptedToken,
          last4: card.last4,
          cardBrand: card.brand,
          cardExpiryMonth: card.expiryMonth,
          cardExpiryYear: card.expiryYear,
        });
        paymentMethod = await qr.manager.save(PaymentMethod, paymentMethod);
      }

      // Link the (possibly new) payment method — the ONLY subscription field we touch.
      if (subscription.paymentMethodId !== paymentMethod.id) {
        await qr.manager.update(Subscription, subscription.id, {
          paymentMethodId: paymentMethod.id,
        });
      }

      await qr.commitTransaction();

      committedData = {
        paymentMethodId: paymentMethod.id,
        last4: paymentMethod.last4,
        brand: paymentMethod.cardBrand,
      };
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Payment-method update failed for subscription #${subscriptionId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.markWebhookStatus(
        webhookLog.id,
        WebhookLogStatus.FAILED,
        `Payment-method update error: ${(err as Error).message}`,
      );
      await this.logPaymentMethodUpdateFailed(
        firebaseId,
        subscriptionId,
        `Transaction error: ${(err as Error).message}`,
        verified.LowProfileId ?? null,
      );
    } finally {
      await qr.release();
    }

    if (!committedData) return;

    await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.PROCESSED);

    await this.billingEventService.logEvent({
      firebaseId,
      eventType: BillingEventType.WEBHOOK_RECEIVED,
      subscriptionId,
      metadata: { idempotencyKey: webhookLog.idempotencyKey, intent: 'CHANGE_PM' },
    });
    await this.billingEventService.logEvent({
      firebaseId,
      eventType: BillingEventType.PAYMENT_METHOD_UPDATED,
      subscriptionId,
      paymentMethodId: committedData.paymentMethodId,
      metadata: {
        last4: committedData.last4,
        brand: committedData.brand,
        lowProfileId: verified.LowProfileId,
      },
    });

    this.logger.log(
      `Payment method replaced: subscription #${subscriptionId} ` +
        `paymentMethodId=${committedData.paymentMethodId} last4=${committedData.last4 ?? 'null'}`,
    );
  }

  private async processVerifiedPaymentMethodUpdateFailure(
    firebaseId: string,
    subscriptionId: number,
    webhookLog: CardcomWebhookLog,
    reason: string,
    lowProfileId: string | null,
  ): Promise<void> {
    this.logger.warn(`Payment-method update failed for subscription #${subscriptionId}: ${reason}`);
    await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.PROCESSED, reason);
    await this.logPaymentMethodUpdateFailed(firebaseId, subscriptionId, reason, lowProfileId);
  }

  /**
   * `lowProfileId` is stamped into metadata so a failure can be correlated back
   * to the exact attempt that produced it. Without it the frontend can only ask
   * "did ANY payment-method update fail recently", which is ambiguous whenever a
   * user retries.
   */
  private async logPaymentMethodUpdateFailed(
    firebaseId: string,
    subscriptionId: number,
    reason: string,
    lowProfileId: string | null,
  ): Promise<void> {
    await this.billingEventService.logEvent({
      firebaseId,
      eventType: BillingEventType.PAYMENT_METHOD_UPDATE_FAILED,
      subscriptionId,
      metadata: { reason, lowProfileId },
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
   * Parses ReturnValue JSON string into routing fields, branching on `intent`.
   *
   *   CHECKOUT  → requires firebaseId + planId + subscriptionId.
   *   CHANGE_PM → requires firebaseId + subscriptionId (NO planId).
   *
   * `intent` is mandatory: a payload with a missing or unknown intent is
   * rejected (value=null) with a specific error — never assumed to be CHECKOUT.
   */
  private parseReturnValue(
    returnValue: string | null,
  ): { value: ParsedReturnValue | null; error: string | null } {
    if (!returnValue) {
      return { value: null, error: 'ReturnValue is missing' };
    }

    let raw: any;
    try {
      raw = JSON.parse(returnValue);
    } catch {
      return { value: null, error: 'ReturnValue is not valid JSON' };
    }

    const { intent, firebaseId, planId, subscriptionId } = raw ?? {};

    if (intent !== 'CHECKOUT' && intent !== 'CHANGE_PM') {
      return {
        value: null,
        error: `ReturnValue intent is missing or invalid (got ${JSON.stringify(intent ?? null)}) — expected CHECKOUT or CHANGE_PM`,
      };
    }

    const firebaseOk = typeof firebaseId === 'string' && firebaseId.length > 0;
    const subscriptionOk =
      typeof subscriptionId === 'number' &&
      Number.isInteger(subscriptionId) &&
      subscriptionId > 0;

    if (!firebaseOk || !subscriptionOk) {
      return {
        value: null,
        error: `ReturnValue ${intent} payload lacks a valid firebaseId/subscriptionId`,
      };
    }

    if (intent === 'CHANGE_PM') {
      return { value: { intent: 'CHANGE_PM', firebaseId, subscriptionId }, error: null };
    }

    const planOk = typeof planId === 'number' && Number.isInteger(planId) && planId > 0;
    if (!planOk) {
      return { value: null, error: 'ReturnValue CHECKOUT payload lacks a valid planId' };
    }

    return {
      value: { intent: 'CHECKOUT', firebaseId, planId, subscriptionId },
      error: null,
    };
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
    /**
     * Overrides the CardCom `Operation` value in the log's event_type column.
     * Used by the reconciliation path so a row created without an inbound
     * webhook is distinguishable in the audit trail.
     */
    eventTypeOverride?: string,
  ): Promise<CardcomWebhookLog | null> {
    try {
      const log = this.webhookLogRepo.create({
        idempotencyKey,
        eventType:
          eventTypeOverride ?? (rawPayload as CardcomWebhookPayload).Operation ?? null,
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
