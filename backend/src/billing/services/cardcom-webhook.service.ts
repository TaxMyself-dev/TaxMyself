import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { encryptCardcomToken } from '../utils/billing-token-encryption.util';

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
import { PayStatus, ModuleName } from 'src/enum';
import { CardcomService } from './cardcom.service';
import { BillingEventService } from './billing-event.service';

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
      parsedReturn?.planId ?? null,
      parsedReturn?.subscriptionId ?? null,
      transactionId != null ? String(transactionId) : null,
      responseCode,
    );

    if (!webhookLog) {
      this.logger.log(`Duplicate webhook ignored: idempotencyKey=${idempotencyKey}`);
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

      // ── 3. Extract transaction + document refs ────────────────────────────
      const tranzactionId =
        verified.TranzactionId ?? verified.TranzactionInfo?.TranzactionId ?? null;

      // TranzactionInfo.Amount is in NIS (shekels); convert to agorot for storage.
      const chargedAmountAgorot =
        verified.TranzactionInfo?.Amount != null
          ? Math.round(verified.TranzactionInfo.Amount * 100)
          : null;

      const documentNumber =
        verified.DocumentInfo?.DocumentNumber?.toString() ??
        verified.TranzactionInfo?.DocumentNumber?.toString() ??
        null;
      const documentType =
        verified.DocumentInfo?.DocumentType?.toString() ??
        verified.TranzactionInfo?.DocumentType?.toString() ??
        null;
      const documentUrl =
        verified.DocumentInfo?.DocumentUrl ??
        verified.TranzactionInfo?.DocumentUrl ??
        null;

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

      // ── 5. Mark webhook processed ─────────────────────────────────────────
      await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.PROCESSED);

      // ── 6. Billing events (fire-and-forget outside transaction) ───────────
      await this.billingEventService.logEvent({
        firebaseId,
        eventType: BillingEventType.WEBHOOK_RECEIVED,
        subscriptionId: subscription.id,
        metadata: { idempotencyKey: webhookLog.idempotencyKey },
      });
      await this.billingEventService.logEvent({
        firebaseId,
        eventType: BillingEventType.PAYMENT_VERIFIED,
        subscriptionId: subscription.id,
        amountAgorot: chargedAmountAgorot,
        currency: 'ILS',
        metadata: { lowProfileId: verified.LowProfileId },
      });
      await this.billingEventService.logEvent({
        firebaseId,
        eventType: BillingEventType.PAYMENT_SUCCESS,
        subscriptionId: subscription.id,
        amountAgorot: chargedAmountAgorot,
        currency: 'ILS',
        cardcomDealNumber: tranzactionId != null ? String(tranzactionId) : null,
        cardcomDocumentNumber: documentNumber,
        cardcomDocumentType: documentType,
        cardcomDocumentUrl: documentUrl,
        metadata: { planId },
      });
      await this.billingEventService.logEvent({
        firebaseId,
        eventType: BillingEventType.SUBSCRIPTION_ACTIVATED,
        subscriptionId: subscription.id,
        metadata: {
          planId,
          planSlug: plan.slug,
          currentPeriodEnd: periodEnd.toISOString(),
        },
      });

      // ── 7. Sync legacy User fields ────────────────────────────────────────
      await this.syncLegacyUserFields(
        firebaseId,
        plan.modules ?? Object.values(ModuleName),
        periodEnd,
      );

      this.logger.log(
        `Payment processed: subscription #${subscription.id} ACTIVE, plan=${plan.slug}`,
      );
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
        checkoutSessionId: null,
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

  private async syncLegacyUserFields(
    firebaseId: string,
    modules: ModuleName[],
    subscriptionEndDate: Date,
  ): Promise<void> {
    try {
      const user = await this.userRepo.findOne({ where: { firebaseId } });
      if (!user) return;
      user.payStatus = PayStatus.PAID;
      user.modulesAccess = modules;
      user.subscriptionEndDate = subscriptionEndDate;
      user.nextBillingDate = subscriptionEndDate;
      await this.userRepo.save(user);
    } catch (err) {
      this.logger.error(
        `Failed to sync legacy User fields for firebaseId=${firebaseId}: ${(err as Error).message}`,
      );
    }
  }
}
