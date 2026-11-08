import { randomUUID } from 'crypto';
import { BillingTasksService } from './billing-tasks.service';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingEventType } from '../enums/billing.enums';
import { redactForLog } from './billing-lifecycle.service';

export interface LogBillingEventInput {
  firebaseId: string;
  eventType: BillingEventType;
  subscriptionId?: number | null;
  paymentMethodId?: number | null;
  /** VAT-inclusive total in agorot. */
  amountAgorot?: number | null;
  /** Pre-VAT base in agorot. Set alongside amountAgorot on CHECKOUT_CREATED and PAYMENT_SUCCESS. */
  amountBeforeVatAgorot?: number | null;
  /** VAT component in agorot. amountBeforeVatAgorot + vatAmountAgorot === amountAgorot. */
  vatAmountAgorot?: number | null;
  currency?: string;
  cardcomDealNumber?: string | null;
  /** Correlates the event with its canonical attempt (existing nullable FK). */
  billingAttemptId?: number | null;
  metadata?: Record<string, any> | null;
}

/**
 * Append-only audit log for all billing actions.
 * Audit helpers are best effort. Durable receipt-email claims and completion
 * are transactional and throw on persistence failure.
 */
@Injectable()
export class BillingEventService {
  private readonly logger = new Logger(BillingEventService.name);

  constructor(
    @InjectRepository(BillingEvent)
    private readonly billingEventRepo: Repository<BillingEvent>,
    @Optional() private readonly tasks?: BillingTasksService,
  ) {}

  async logEvent(input: LogBillingEventInput): Promise<BillingEvent | null> {
    try {
      const event = this.billingEventRepo.create({
        firebaseId: input.firebaseId,
        eventType: input.eventType,
        subscriptionId: input.subscriptionId ?? null,
        paymentMethodId: input.paymentMethodId ?? null,
        amountAgorot: input.amountAgorot ?? null,
        amountBeforeVatAgorot: input.amountBeforeVatAgorot ?? null,
        vatAmountAgorot: input.vatAmountAgorot ?? null,
        currency: input.currency ?? 'ILS',
        cardcomDealNumber: input.cardcomDealNumber ?? null,
        billingAttemptId: input.billingAttemptId ?? null,
        metadata: input.metadata ?? null,
      });
      return await this.billingEventRepo.save(event);
    } catch (error) {
      // Intentionally swallowed — billing event logging must never disrupt the
      // main payment flow. Errors are only surfaced in logs.
      this.logger.error(
        `Failed to persist billing event [${input.eventType}] for firebaseId=${input.firebaseId}: ${(error as Error)?.message ?? error}`,
        (error as Error)?.stack,
      );
      return null;
    }
  }

  /**
   * Returns the VAT breakdown stored on the most recent CHECKOUT_CREATED event
   * for the given subscription. Used by the webhook handler to copy the canonical
   * amounts onto the PAYMENT_SUCCESS row without recalculating from the plan.
   *
   * Returns null if no matching event is found or the breakdown was not stored.
   */
  async findCheckoutBreakdown(subscriptionId: number): Promise<{
    amountBeforeVatAgorot: number;
    vatAmountAgorot: number;
    amountIncludingVatAgorot: number;
  } | null> {
    try {
      const event = await this.billingEventRepo.findOne({
        where: {
          subscriptionId,
          eventType: BillingEventType.CHECKOUT_CREATED,
        },
        order: { createdAt: 'DESC' },
        select: ['amountBeforeVatAgorot', 'vatAmountAgorot', 'amountAgorot'],
      });

      if (
        !event ||
        event.amountBeforeVatAgorot == null ||
        event.vatAmountAgorot == null ||
        event.amountAgorot == null
      ) {
        return null;
      }

      return {
        amountBeforeVatAgorot: event.amountBeforeVatAgorot,
        vatAmountAgorot: event.vatAmountAgorot,
        amountIncludingVatAgorot: event.amountAgorot,
      };
    } catch (error) {
      this.logger.error(
        `findCheckoutBreakdown failed for subscriptionId=${subscriptionId}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  /**
   * Returns the most recent PAYMENT_SUCCESS event for the given subscription.
   * Filters by cardcomDealNumber when provided for a tighter match.
   * Used by the webhook handler to check idempotency and to link the receipt.
   */
  async findPaymentSuccessEvent(
    subscriptionId: number,
    cardcomDealNumber: string | null,
  ): Promise<BillingEvent | null> {
    try {
      return await this.billingEventRepo.findOne({
        where: cardcomDealNumber
          ? { subscriptionId, eventType: BillingEventType.PAYMENT_SUCCESS, cardcomDealNumber }
          : { subscriptionId, eventType: BillingEventType.PAYMENT_SUCCESS },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(
        `findPaymentSuccessEvent failed for subscriptionId=${subscriptionId}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  /**
   * The success event (PAYMENT_SUCCESS / RENEWAL_SUCCESS) already recorded for
   * a canonical attempt. This is what makes post-capture recovery idempotent at
   * the audit level: a retry re-uses this row (and its receiptDocId /
   * receiptEmailSent flags) instead of logging a second success event.
   * Returns null when none exists or the lookup fails.
   */
  async findSuccessEventForAttempt(
    billingAttemptId: number,
    eventType: BillingEventType.PAYMENT_SUCCESS | BillingEventType.RENEWAL_SUCCESS,
  ): Promise<BillingEvent | null> {
    return this.findEventForAttempt(billingAttemptId, eventType);
  }

  /** Oldest event of one type already recorded for a canonical attempt. */
  async findEventForAttempt(
    billingAttemptId: number,
    eventType: BillingEventType,
  ): Promise<BillingEvent | null> {
    try {
      return await this.billingEventRepo.findOne({
        where: { billingAttemptId, eventType },
        order: { createdAt: 'ASC' },
      });
    } catch (error) {
      this.logger.error(
        `findEventForAttempt failed for billingAttemptId=${billingAttemptId} type=${eventType}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  /** Every event of one type recorded for a canonical attempt, oldest first. */
  async findEventsForAttempt(
    billingAttemptId: number,
    eventType: BillingEventType,
  ): Promise<BillingEvent[]> {
    try {
      return await this.billingEventRepo.find({
        where: { billingAttemptId, eventType },
        order: { createdAt: 'ASC' },
      });
    } catch (error) {
      this.logger.error(
        `findEventsForAttempt failed for billingAttemptId=${billingAttemptId} type=${eventType}: ${(error as Error)?.message ?? error}`,
      );
      return [];
    }
  }

  /**
   * Records a post-capture failure for an attempt at most once. Repeated retries
   * of the same stuck attempt must not append a new RECEIPT_FAILED row every
   * run: the first row is the audit record, later retries re-use it.
   */
  async logReceiptFailureOncePerAttempt(
    input: Omit<LogBillingEventInput, 'eventType'> & { billingAttemptId: number },
  ): Promise<BillingEvent | null> {
    const existing = await this.findEventForAttempt(
      input.billingAttemptId,
      BillingEventType.RECEIPT_FAILED,
    );
    if (existing) return existing;
    return this.logEvent({ ...input, eventType: BillingEventType.RECEIPT_FAILED });
  }

  /**
   * Links the receipt to its billing event. Returns false when the write
   * fails (never throws, so legacy best-effort callers are unchanged) —
   * callers that must not lose the link, i.e. canonical post-capture recovery,
   * check the result and keep the attempt recoverable instead of finalizing.
   */
  async updatePaymentEventWithReceipt(eventId: number, receiptDocId: number): Promise<boolean> {
    try {
      await this.billingEventRepo.update({ id: eventId }, { receiptDocId });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to update billing event ${eventId} with receiptDocId=${receiptDocId}: ${redactForLog(
          String((error as Error)?.message ?? error),
        )}`,
        (error as Error)?.stack
          ? redactForLog((error as Error).stack as string)
          : undefined,
      );
      return false;
    }
  }

  /** Durable delivery claims throw on DB failure: never send without a saved lease. */
  async claimReceiptEmail(eventId: number, manual = false, now = new Date(), actor?: string): Promise<string | null> {
    let wakeup: Date | undefined;
    const result = await this.billingEventRepo.manager.transaction(async manager => {
      const event = await manager.findOne(BillingEvent, { where: { id: eventId }, lock: { mode: 'pessimistic_write' } });
      if (!event?.receiptDocId || ![BillingEventType.PAYMENT_SUCCESS, BillingEventType.RENEWAL_SUCCESS, BillingEventType.REFUND_SUCCESS].includes(event.eventType)) return null;
      const previous = event.metadata?.receiptEmail ?? {};
      if (Date.parse(previous.leaseUntil ?? '') > now.getTime()) return null;
      if (!manual && (event.receiptEmailSent || previous.skipped === 'NO_RECIPIENT' || Date.parse(previous.nextAttemptAt ?? '') > now.getTime())) return null;
      const leaseId = randomUUID();
      const attempts = Number(previous.attempts ?? 0) + 1;
      const delay = ([1, 5, 15, 30][attempts - 1] ?? 60) * 60000;
      event.metadata = { ...(event.metadata ?? {}), receiptEmail: {
        ...previous, sent: false, attempts, leaseId, skipped: null,
        leaseUntil: new Date(now.getTime() + 5 * 60000).toISOString(),
        nextAttemptAt: new Date(now.getTime() + 5 * 60000 + delay).toISOString(),
        lastAttemptAt: now.toISOString(), ...(actor ? { lastAdminActor: actor } : {}),
      } };
      // Manual resend after an earlier success must also survive a failed send/crash.
      event.receiptEmailSent = false;
      await manager.save(BillingEvent, event);
      if ([BillingEventType.PAYMENT_SUCCESS, BillingEventType.RENEWAL_SUCCESS].includes(event.eventType)) {
        wakeup = new Date(event.metadata.receiptEmail.nextAttemptAt);
      }
      return leaseId;
    });
    if (wakeup) await this.tasks?.enqueue('MAIL', eventId, wakeup).catch(() => undefined);
    return result;
  }

  async finishReceiptEmail(eventId: number, leaseId: string, sent: boolean, error?: string, skipped = false): Promise<void> {
    let wakeup: Date | undefined;
    await this.billingEventRepo.manager.transaction(async manager => {
      const event = await manager.findOne(BillingEvent, { where: { id: eventId }, lock: { mode: 'pessimistic_write' } });
      if (!event || event.metadata?.receiptEmail?.leaseId !== leaseId) return;
      const previous = event.metadata.receiptEmail;
      const run = Math.max(1, Number(previous.attempts ?? 1));
      const minutes = [1, 5, 15, 30][run - 1] ?? 60;
      event.receiptEmailSent = sent;
      event.metadata = { ...event.metadata, receiptEmail: { ...previous, sent,
        leaseId: null, leaseUntil: null,
        nextAttemptAt: sent || skipped ? null : new Date(Date.now() + minutes * 60000).toISOString(),
        lastError: error ? redactForLog(error).slice(0, 500) : null,
        skipped: skipped ? 'NO_RECIPIENT' : null,
      } };
      await manager.save(BillingEvent, event);
      if (!sent && !skipped && [BillingEventType.PAYMENT_SUCCESS, BillingEventType.RENEWAL_SUCCESS].includes(event.eventType)) {
        wakeup = new Date(event.metadata.receiptEmail.nextAttemptAt);
      }
    });
    if (wakeup) await this.tasks?.enqueue('MAIL', eventId, wakeup).catch(() => undefined);
  }

  async findDueReceiptEmails(now = new Date(), limit = 20, afterId = 0): Promise<BillingEvent[]> {
    return this.billingEventRepo.createQueryBuilder('e')
      .where('e.eventType IN (:...types)', { types: [BillingEventType.PAYMENT_SUCCESS, BillingEventType.RENEWAL_SUCCESS] })
      .andWhere('e.receiptDocId IS NOT NULL AND e.receiptEmailSent = false')
      .andWhere("JSON_EXTRACT(e.metadata, '$.receiptEmail.attempts') > 0")
      .andWhere("COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.metadata, '$.receiptEmail.skipped')), '') <> 'NO_RECIPIENT'")
      .andWhere("COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(e.metadata, '$.receiptEmail.nextAttemptAt')), 'null'), '') <= :now", { now: now.toISOString() })
      .andWhere("COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(e.metadata, '$.receiptEmail.leaseUntil')), 'null'), '') <= :now", { now: now.toISOString() })
      .andWhere('e.id > :afterId', { afterId })
      .orderBy('e.id', 'ASC').take(limit).getMany();
  }

  /** Queue processing must distinguish a missing row from a failed DB read. */
  async findReceiptTaskEvent(id: number): Promise<BillingEvent | null> {
    return this.billingEventRepo.findOne({ where: { id } });
  }

  async markReceiptEmailSent(eventId: number): Promise<void> {
    try {
      await this.billingEventRepo.update({ id: eventId }, { receiptEmailSent: true });
    } catch (error) {
      this.logger.error(
        `Failed to mark receipt email sent on event ${eventId}: ${(error as Error)?.message ?? error}`,
        (error as Error)?.stack,
      );
    }
  }

  async incrementReceiptEmailFailure(eventId: number, errorMessage: string): Promise<void> {
    try {
      const event = await this.billingEventRepo.findOne({ where: { id: eventId } });
      if (!event) return;
      const prev = (event.metadata?.receiptEmail as Record<string, any>) ?? {};
      event.metadata = {
        ...(event.metadata ?? {}),
        receiptEmail: {
          sent: false,
          attempts: ((prev.attempts as number) ?? 0) + 1,
          lastError: errorMessage,
          lastAttemptAt: new Date().toISOString(),
        },
      };
      await this.billingEventRepo.save(event);
    } catch (error) {
      this.logger.error(
        `Failed to record receipt email failure on event ${eventId}: ${(error as Error)?.message ?? error}`,
        (error as Error)?.stack,
      );
    }
  }

  /**
   * Returns the most recent PAYMENT_SUCCESS or PAYMENT_FAILED event for the
   * given user, regardless of subscription. Used by the billing/me endpoint
   * to report CardCom payment/invoice outcome to the frontend after a return
   * from the hosted payment page.
   */
  async findLatestPaymentResultEvent(firebaseId: string, billingAttemptId?: number): Promise<BillingEvent | null> {
    try {
      return await this.billingEventRepo.findOne({
        where: {
          firebaseId,
          eventType: In([BillingEventType.PAYMENT_SUCCESS, BillingEventType.PAYMENT_FAILED]),
          ...(billingAttemptId != null ? { billingAttemptId } : {}),
        },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(
        `findLatestPaymentResultEvent failed for firebaseId=${firebaseId}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  /**
   * True if a RECEIPT_FAILED event was logged for this subscription at or after
   * the given timestamp. Used by billing/me to distinguish "receipt still being
   * generated" (still within the processing window) from "receipt generation
   * permanently failed" for a given PAYMENT_SUCCESS event.
   */
  async hasReceiptFailedAfter(subscriptionId: number, after: Date): Promise<boolean> {
    try {
      const event = await this.billingEventRepo.findOne({
        where: { subscriptionId, eventType: BillingEventType.RECEIPT_FAILED },
        order: { createdAt: 'DESC' },
      });
      return !!event && event.createdAt >= after;
    } catch (error) {
      this.logger.error(
        `hasReceiptFailedAfter failed for subscriptionId=${subscriptionId}: ${(error as Error)?.message ?? error}`,
      );
      return false;
    }
  }

  /**
   * Returns the user's full payment history — every PAYMENT/RENEWAL success or
   * failure event, newest first. Used by GET /billing/payments to render the
   * payment-history table. Read-only; never throws (returns [] on error).
   */
  async findUserPaymentHistory(firebaseId: string): Promise<BillingEvent[]> {
    try {
      return await this.billingEventRepo.find({
        where: {
          firebaseId,
          eventType: In([
            BillingEventType.REFUND_SUCCESS,
            BillingEventType.PAYMENT_SUCCESS,
            BillingEventType.PAYMENT_FAILED,
            BillingEventType.RENEWAL_SUCCESS,
            BillingEventType.RENEWAL_FAILED,
          ]),
        },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(
        `findUserPaymentHistory failed for firebaseId=${firebaseId}: ${(error as Error)?.message ?? error}`,
      );
      return [];
    }
  }

  /**
   * Returns the most recent PAYMENT_METHOD_UPDATED or PAYMENT_METHOD_UPDATE_FAILED
   * event for the user. Used by billing/me to report the outcome of a
   * change-payment-method flow after the user returns from CardCom. Read-only.
   */
  async findLatestPaymentMethodUpdateResultEvent(firebaseId: string): Promise<BillingEvent | null> {
    try {
      return await this.billingEventRepo.findOne({
        where: {
          firebaseId,
          eventType: In([
            BillingEventType.PAYMENT_METHOD_UPDATED,
            BillingEventType.PAYMENT_METHOD_UPDATE_FAILED,
          ]),
        },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(
        `findLatestPaymentMethodUpdateResultEvent failed for firebaseId=${firebaseId}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  /**
   * The PAYMENT_METHOD_UPDATE_REQUESTED event that opened a specific
   * change-payment-method attempt, identified by its CardCom LowProfileId.
   *
   * This is the anchor for correlating one attempt end-to-end: it carries both
   * the subscription and the moment the attempt started, which is what lets the
   * status endpoint decide whether a later `payment_method` write belongs to
   * THIS attempt rather than an earlier one.
   *
   * Scoped by firebaseId so a LowProfileId guessed by another user resolves to
   * nothing.
   */
  async findPaymentMethodUpdateRequest(
    firebaseId: string,
    lowProfileId: string,
  ): Promise<BillingEvent | null> {
    try {
      return await this.billingEventRepo
        .createQueryBuilder('e')
        .where('e.firebaseId = :firebaseId', { firebaseId })
        .andWhere('e.eventType = :eventType', {
          eventType: BillingEventType.PAYMENT_METHOD_UPDATE_REQUESTED,
        })
        .andWhere(
          "JSON_UNQUOTE(JSON_EXTRACT(e.metadata, '$.cardcomLowProfileId')) = :lowProfileId",
          { lowProfileId },
        )
        .orderBy('e.createdAt', 'DESC')
        .getOne();
    } catch (error) {
      this.logger.error(
        `findPaymentMethodUpdateRequest failed for lowProfileId=${lowProfileId}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  /**
   * Terminal outcome (updated or failed) recorded for a specific LowProfileId.
   * Both the webhook and the reconciliation path stamp `metadata.lowProfileId`,
   * so this resolves whichever one got there first.
   *
   * Callers must NOT treat a null here as "not finished" — the event write is
   * best-effort (see logEvent) and can fail after the card was already replaced.
   * BillingService.getChangePaymentMethodStatus cross-checks the actual
   * payment_method row for exactly that reason.
   */
  async findPaymentMethodUpdateOutcome(
    firebaseId: string,
    lowProfileId: string,
  ): Promise<BillingEvent | null> {
    try {
      return await this.billingEventRepo
        .createQueryBuilder('e')
        .where('e.firebaseId = :firebaseId', { firebaseId })
        .andWhere('e.eventType IN (:...eventTypes)', {
          eventTypes: [
            BillingEventType.PAYMENT_METHOD_UPDATED,
            BillingEventType.PAYMENT_METHOD_UPDATE_FAILED,
          ],
        })
        .andWhere(
          "JSON_UNQUOTE(JSON_EXTRACT(e.metadata, '$.lowProfileId')) = :lowProfileId",
          { lowProfileId },
        )
        .orderBy('e.createdAt', 'DESC')
        .getOne();
    } catch (error) {
      this.logger.error(
        `findPaymentMethodUpdateOutcome failed for lowProfileId=${lowProfileId}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  async findPaymentEventById(eventId: number): Promise<BillingEvent | null> {
    try {
      return await this.billingEventRepo.findOne({ where: { id: eventId } });
    } catch (error) {
      this.logger.error(
        `findPaymentEventById failed for eventId=${eventId}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  /**
   * Returns the subscription's most recent successful charge event
   * (PAYMENT_SUCCESS or RENEWAL_SUCCESS) if — and only if — it still has no
   * receiptDocId, meaning receipt generation failed for it and was never
   * resolved. Returns null when the subscription has no unresolved failure
   * (either the latest charge already has a receipt, or there's no charge at
   * all yet).
   *
   * This is the single source of truth for "is this subscription blocked from
   * further payments pending manual receipt generation" — deliberately not a
   * separate flag column, so resolving the failure (via
   * updatePaymentEventWithReceipt) automatically and atomically clears the
   * block with no separate state to keep in sync.
   */
  async getUnresolvedReceiptFailure(subscriptionId: number): Promise<BillingEvent | null> {
    try {
      return await this.billingEventRepo.findOne({
        where: {
          subscriptionId,
          eventType: In([BillingEventType.PAYMENT_SUCCESS, BillingEventType.RENEWAL_SUCCESS]),
        },
        order: { createdAt: 'DESC' },
      }).then((event) => (event && event.receiptDocId == null ? event : null));
    } catch (error) {
      this.logger.error(
        `getUnresolvedReceiptFailure failed for subscriptionId=${subscriptionId}: ${(error as Error)?.message ?? error}`,
      );
      // Fail open — a logging/lookup error here must never itself block a
      // legitimate payment.
      return null;
    }
  }

  /**
   * Renewal idempotency check: true if a RENEWAL_SUCCESS event already exists
   * for this subscription + idempotency key (renewal:{subscriptionId}:{billingPeriod}).
   * Runs against the given EntityManager so it participates in the caller's
   * row-locked transaction (the renewal flow checks this before charging).
   */
  async hasSuccessfulRenewal(
    manager: EntityManager,
    subscriptionId: number,
    idempotencyKey: string,
  ): Promise<boolean> {
    try {
      const rows: Array<{ id: number }> = await manager.query(
        `SELECT id FROM billing_event
         WHERE subscription_id = ?
           AND event_type = ?
           AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.idempotencyKey')) = ?
         LIMIT 1`,
        [subscriptionId, BillingEventType.RENEWAL_SUCCESS, idempotencyKey],
      );
      return rows.length > 0;
    } catch (error) {
      this.logger.error(
        `hasSuccessfulRenewal failed for subscriptionId=${subscriptionId} idempotencyKey=${idempotencyKey}: ${(error as Error)?.message ?? error}`,
      );
      // Fail closed would risk double-charging; fail open here and rely on
      // CardCom's own ExternalUniqTranId idempotency as the backstop.
      return false;
    }
  }
}
