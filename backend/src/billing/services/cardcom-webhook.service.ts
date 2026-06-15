import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { encryptCardcomToken } from '../utils/billing-token-encryption.util';

import { CardcomCheckoutSession } from '../entities/cardcom-checkout-session.entity';
import { CardcomWebhookLog } from '../entities/cardcom-webhook-log.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Coupon } from '../entities/coupon.entity';
import { CouponRedemption } from '../entities/coupon-redemption.entity';
import { Promotion } from '../entities/promotion.entity';
import { User } from 'src/users/user.entity';

import {
  BillingEventType,
  CheckoutSessionStatus,
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

@Injectable()
export class CardcomWebhookService implements OnModuleInit {
  private readonly logger = new Logger(CardcomWebhookService.name);

  constructor(
    @InjectRepository(CardcomCheckoutSession)
    private readonly checkoutSessionRepo: Repository<CardcomCheckoutSession>,
    @InjectRepository(CardcomWebhookLog)
    private readonly webhookLogRepo: Repository<CardcomWebhookLog>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepo: Repository<PaymentMethod>,
    @InjectRepository(Coupon)
    private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(CouponRedemption)
    private readonly couponRedemptionRepo: Repository<CouponRedemption>,
    @InjectRepository(Promotion)
    private readonly promotionRepo: Repository<Promotion>,
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
    // Trigger key-length validation by attempting a dummy encryption.
    // This surfaces misconfigured keys at startup rather than during a live payment.
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

    this.logger.log(
      `Webhook received: lowProfileId=${lowProfileId ?? 'none'} ` +
        `returnValue=${returnValue ?? 'none'} idempotencyKey=${idempotencyKey.slice(0, 24)}...`,
    );

    // ── Save webhook log (idempotency gate) ───────────────────────────────────
    const webhookLog = await this.saveWebhookLog(
      rawPayload,
      idempotencyKey,
      lowProfileId,
    );

    if (!webhookLog) {
      // Unique constraint violation — already processed. Safe to return ok.
      this.logger.log(`Duplicate webhook ignored: idempotencyKey=${idempotencyKey}`);
      return;
    }

    // ── Resolve checkout session ───────────────────────────────────────────────
    const sessionId = returnValue ? parseInt(returnValue, 10) : NaN;

    if (!returnValue || isNaN(sessionId)) {
      this.logger.warn(
        `Webhook has no valid ReturnValue — cannot resolve session. idempotencyKey=${idempotencyKey}`,
      );
      await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.IGNORED, 'ReturnValue missing or invalid');
      return;
    }

    const session = await this.checkoutSessionRepo.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      this.logger.warn(`Webhook ReturnValue=${returnValue} — no matching checkout session found`);
      await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.IGNORED, `Session ${sessionId} not found`);
      return;
    }

    if (session.status !== CheckoutSessionStatus.PENDING) {
      this.logger.log(
        `Webhook for session #${session.id} ignored — already in status=${session.status}`,
      );
      await this.markWebhookStatus(
        webhookLog.id,
        WebhookLogStatus.IGNORED,
        `Session already ${session.status}`,
      );
      return;
    }

    // ── Verify payment independently via GetLpResult ──────────────────────────
    const verifyLowProfileId = lowProfileId ?? session.cardcomLowProfileId;

    if (!verifyLowProfileId) {
      this.logger.error(
        `Webhook for session #${session.id} — no LowProfileId to verify against`,
      );
      await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.FAILED, 'No LowProfileId for verification');
      return;
    }

    let verifiedResult: Record<string, any>;
    try {
      verifiedResult = await this.cardcomService.getLowProfileResult(verifyLowProfileId);
    } catch (err) {
      this.logger.error(
        `GetLpResult failed for session #${session.id}: ${(err as Error).message}`,
      );
      await this.markWebhookStatus(
        webhookLog.id,
        WebhookLogStatus.FAILED,
        `GetLpResult error: ${(err as Error).message}`,
      );
      // Do not mark session FAILED — could be a temporary network issue.
      return;
    }

    // Link webhook log to the checkout session now that we've resolved it.
    await this.webhookLogRepo.update(webhookLog.id, {
      checkoutSessionId: session.id,
    });

    const verified = verifiedResult as CardcomWebhookPayload;

    // A successful payment requires ResponseCode=0 at the top level AND
    // at the TranzactionInfo level (if present).
    const topLevelOk = (verified.ResponseCode ?? -1) === 0;
    const txOk =
      !verified.TranzactionInfo ||
      (verified.TranzactionInfo.ResponseCode ?? -1) === 0;

    // Verify ReturnValue in GetLpResult matches our session id (anti-confusion guard).
    const verifiedReturnMatch =
      !verified.ReturnValue || verified.ReturnValue === String(session.id);

    if (topLevelOk && txOk && verifiedReturnMatch) {
      await this.processVerifiedSuccess(session, verified, webhookLog);
    } else {
      const reason = !topLevelOk
        ? `ResponseCode=${verified.ResponseCode ?? 'missing'} desc=${verified.Description ?? ''}`
        : !txOk
          ? `TranzactionInfo.ResponseCode=${verified.TranzactionInfo?.ResponseCode}`
          : 'ReturnValue mismatch';
      await this.processVerifiedFailure(session, webhookLog, reason);
    }
  }

  // ─── Success path ─────────────────────────────────────────────────────────

  private async processVerifiedSuccess(
    session: CardcomCheckoutSession,
    verified: CardcomWebhookPayload,
    webhookLog: CardcomWebhookLog,
  ): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Re-load session inside transaction to guard against concurrent webhooks.
      const lockedSession = await qr.manager.findOne(CardcomCheckoutSession, {
        where: { id: session.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedSession || lockedSession.status !== CheckoutSessionStatus.PENDING) {
        // Another webhook beat us to it — idempotent exit.
        await qr.rollbackTransaction();
        this.logger.log(`Session #${session.id} concurrently processed — skipping`);
        await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.IGNORED, 'Concurrent processing');
        return;
      }

      const subscription = await qr.manager.findOneOrFail(Subscription, {
        where: { id: lockedSession.subscriptionId },
      });

      const plan = await qr.manager.findOneOrFail(SubscriptionPlan, {
        where: { id: lockedSession.planId },
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
          `Session #${session.id} — payment succeeded but no token in GetLpResult. ` +
            `Monthly renewal will not be possible until a token is stored.`,
        );
      }

      // ── 2. Create or update payment_method ────────────────────────────────
      const cardExpiryMonth =
        verified.TokenInfo?.CardMonth ??
        verified.TranzactionInfo?.CardMonth ??
        null;
      const cardExpiryYear =
        verified.TokenInfo?.CardYear ??
        verified.TranzactionInfo?.CardYear ??
        null;

      let paymentMethod: PaymentMethod | null = null;
      if (token) {
        // Encrypt the token before persistence. A CardCom token is a bearer
        // credential — possessing it allows recurring charges. Never store plaintext.
        // Decryption is only needed in the monthly renewal charge flow when calling
        // the CardCom recurring-charge API (not yet implemented).
        const encryptedToken = encryptCardcomToken(token);
        paymentMethod = qr.manager.create(PaymentMethod, {
          firebaseId: session.firebaseId,
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
        verified.TranzactionId ??
        verified.TranzactionInfo?.TranzactionId ??
        null;

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

      // ── 4. Update checkout session ────────────────────────────────────────
      await qr.manager.update(CardcomCheckoutSession, session.id, {
        status: CheckoutSessionStatus.COMPLETED,
        paidAt: now,
        webhookReceivedAt: now,
        verifiedAt: now,
        cardcomDealNumber: tranzactionId != null ? String(tranzactionId) : null,
        cardcomDocumentNumber: documentNumber,
        cardcomDocumentType: documentType,
        cardcomDocumentUrl: documentUrl,
        rawCardcomResponse: verified as Record<string, any>,
      });

      // ── 5. Activate subscription ──────────────────────────────────────────
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await qr.manager.update(Subscription, subscription.id, {
        status: SubscriptionStatus.ACTIVE,
        planId: lockedSession.planId,
        paymentMethodId: paymentMethod?.id ?? subscription.paymentMethodId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
        gracePeriodEndsAt: null,
        canceledAt: null,
        endedAt: null,
      });

      // ── 6. Coupon redemption ──────────────────────────────────────────────
      if (lockedSession.couponId) {
        const redemption = qr.manager.create(CouponRedemption, {
          couponId: lockedSession.couponId,
          firebaseId: session.firebaseId,
          subscriptionId: subscription.id,
          checkoutSessionId: session.id,
          redeemedAmountAgorot: lockedSession.discountAmountAgorot,
          redeemedAt: now,
        });
        await qr.manager.save(CouponRedemption, redemption);
        await qr.manager.increment(Coupon, { id: lockedSession.couponId }, 'currentRedemptions', 1);
      }

      // ── 7. Promotion redemption count ─────────────────────────────────────
      if (lockedSession.promotionId) {
        await qr.manager.increment(
          Promotion,
          { id: lockedSession.promotionId },
          'currentRedemptions',
          1,
        );
      }

      await qr.commitTransaction();

      // ── 8. Mark webhook processed ─────────────────────────────────────────
      await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.PROCESSED);

      // ── 9. Billing events (fire-and-forget outside transaction) ───────────
      await this.billingEventService.logEvent({
        firebaseId: session.firebaseId,
        eventType: BillingEventType.WEBHOOK_RECEIVED,
        subscriptionId: subscription.id,
        checkoutSessionId: session.id,
        metadata: { idempotencyKey: webhookLog.idempotencyKey },
      });
      await this.billingEventService.logEvent({
        firebaseId: session.firebaseId,
        eventType: BillingEventType.PAYMENT_VERIFIED,
        subscriptionId: subscription.id,
        checkoutSessionId: session.id,
        amountAgorot: lockedSession.finalAmountAgorot,
        currency: lockedSession.currency,
        metadata: { lowProfileId: verified.LowProfileId },
      });
      await this.billingEventService.logEvent({
        firebaseId: session.firebaseId,
        eventType: BillingEventType.PAYMENT_SUCCESS,
        subscriptionId: subscription.id,
        checkoutSessionId: session.id,
        amountAgorot: lockedSession.finalAmountAgorot,
        currency: lockedSession.currency,
        cardcomDealNumber: tranzactionId != null ? String(tranzactionId) : null,
        cardcomDocumentNumber: documentNumber,
        cardcomDocumentType: documentType,
        cardcomDocumentUrl: documentUrl,
        metadata: { planId: lockedSession.planId },
      });
      await this.billingEventService.logEvent({
        firebaseId: session.firebaseId,
        eventType: BillingEventType.SUBSCRIPTION_ACTIVATED,
        subscriptionId: subscription.id,
        checkoutSessionId: session.id,
        metadata: {
          planId: lockedSession.planId,
          planSlug: plan.slug,
          currentPeriodEnd: periodEnd.toISOString(),
        },
      });
      if (lockedSession.couponId) {
        await this.billingEventService.logEvent({
          firebaseId: session.firebaseId,
          eventType: BillingEventType.COUPON_REDEEMED,
          subscriptionId: subscription.id,
          checkoutSessionId: session.id,
          amountAgorot: lockedSession.discountAmountAgorot,
          metadata: { couponId: lockedSession.couponId },
        });
      }
      if (lockedSession.promotionId) {
        await this.billingEventService.logEvent({
          firebaseId: session.firebaseId,
          eventType: BillingEventType.PROMOTION_APPLIED,
          subscriptionId: subscription.id,
          checkoutSessionId: session.id,
          amountAgorot: lockedSession.discountAmountAgorot,
          metadata: { promotionId: lockedSession.promotionId },
        });
      }

      // ── 10. Sync legacy User fields ───────────────────────────────────────
      await this.syncLegacyUserFields(
        session.firebaseId,
        plan.modules ?? Object.values(ModuleName),
        periodEnd,
      );

      this.logger.log(
        `Payment processed: session #${session.id} COMPLETED, ` +
          `subscription #${subscription.id} ACTIVE, plan=${plan.slug}`,
      );
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Transaction failed for session #${session.id}: ${(err as Error).message}`,
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
    session: CardcomCheckoutSession,
    webhookLog: CardcomWebhookLog,
    reason: string,
  ): Promise<void> {
    this.logger.warn(
      `Payment failed for session #${session.id}: ${reason}`,
    );

    try {
      await this.checkoutSessionRepo.update(session.id, {
        status: CheckoutSessionStatus.FAILED,
        webhookReceivedAt: new Date(),
      });
    } catch (err) {
      this.logger.error(
        `Failed to mark session #${session.id} as FAILED: ${(err as Error).message}`,
      );
    }

    await this.markWebhookStatus(webhookLog.id, WebhookLogStatus.PROCESSED, reason);

    await this.billingEventService.logEvent({
      firebaseId: session.firebaseId,
      eventType: BillingEventType.PAYMENT_FAILED,
      subscriptionId: session.subscriptionId,
      checkoutSessionId: session.id,
      amountAgorot: session.finalAmountAgorot,
      currency: session.currency,
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
   * Inserts a webhook log row.
   * Returns null if the idempotency key already exists (duplicate webhook).
   */
  private async saveWebhookLog(
    rawPayload: Record<string, any>,
    idempotencyKey: string,
    lowProfileId: string | null,
  ): Promise<CardcomWebhookLog | null> {
    try {
      const log = this.webhookLogRepo.create({
        idempotencyKey,
        eventType: (rawPayload as CardcomWebhookPayload).Operation ?? null,
        payload: rawPayload,
        status: WebhookLogStatus.RECEIVED,
        receivedAt: new Date(),
        checkoutSessionId: null,
      });
      return await this.webhookLogRepo.save(log);
    } catch (err: any) {
      // MySQL error 1062 = duplicate entry (unique constraint on idempotencyKey).
      if (err?.code === 'ER_DUP_ENTRY' || err?.driverError?.code === 'ER_DUP_ENTRY') {
        return null;
      }
      // Re-throw genuine errors so the caller can return 500 for truly broken requests.
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
