import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, IsNull, LessThanOrEqual, Or } from 'typeorm';
import { Documents } from 'src/documents/documents.entity';
import { DocumentsService } from 'src/documents/documents.service';
import { Currency, DocumentType } from 'src/enum';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { Subscription } from '../entities/subscription.entity';
import { BillingAttemptStatus as S, BillingAttemptTrigger, BillingChargeMode, BillingEventType as E } from '../enums/billing.enums';
import { CreateRefundDto, ResolveRefundDto } from '../dtos/admin/refund.dto';
import { REFUND_RESERVED_STATUSES, refundBreakdown } from '../domain/billing-refund';
import { BillingIssuerConfigService } from './billing-issuer-config.service';
import { BillingReceiptService } from './billing-receipt.service';
import { CardcomService } from './cardcom.service';

const SUCCESS = [E.PAYMENT_SUCCESS, E.RENEWAL_SUCCESS];
const LEASE_MS = 10 * 60_000;

/** Refunds reuse payment persistence and document provenance, never debt finalization. */
@Injectable()
export class BillingRefundService {
  private readonly logger = new Logger(BillingRefundService.name);
  private sweeping = false;
  constructor(private readonly db: DataSource, private readonly cardcom: CardcomService,
    private readonly documents: DocumentsService, private readonly receipts: BillingReceiptService,
    private readonly issuers: BillingIssuerConfigService) {}

  private async subscription(m: EntityManager, id: number, lock = false) {
    const sub = await m.findOne(Subscription, { where: { id }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!sub) throw new NotFoundException('המנוי לא נמצא');
    return sub;
  }

  private async payment(m: EntityManager, sub: Subscription, id: number) {
    const event = await m.findOne(BillingEvent, { where: { id, subscriptionId: sub.id, firebaseId: sub.firebaseId,
      eventType: In(SUCCESS) } });
    if (!event || !/^[1-9]\d*$/.test(event.cardcomDealNumber ?? '') ||
      !Number.isSafeInteger(Number(event.cardcomDealNumber)) || !Number.isSafeInteger(event.amountAgorot) ||
      event.amountAgorot <= 0 || event.currency !== 'ILS' || !event.receiptDocId) {
      throw new BadRequestException('לחיוב חסרים מזהה קארדקום, סכום או מסמך מקור תקינים');
    }
    // Old webhook duplicates must not create independent refundable balances.
    const canonical = await m.findOne(BillingEvent, { where: {
      cardcomDealNumber: event.cardcomDealNumber, eventType: In(SUCCESS) }, order: { id: 'ASC' } });
    if (canonical.id !== id) throw new BadRequestException('יש לבחור את רשומת המקור של החיוב');
    return event;
  }

  private async originalDocument(m: EntityManager, event: BillingEvent) {
    const issuer = await this.issuers.getKeepintaxIssuer();
    const doc = await m.findOne(Documents, { where: { id: event.receiptDocId } });
    if (!doc || doc.issuerBusinessNumber !== issuer.issuerBusinessNumber || doc.docType !== DocumentType.TAX_INVOICE_RECEIPT ||
      doc.currency !== Currency.ILS || Math.round(Number(doc.sumAftDisWithVAT) * 100) !== event.amountAgorot ||
      !Number.isFinite(Number(doc.docVatRate))) throw new BadRequestException('מסמך המקור אינו מתאים לחיוב; נדרשת בדיקה');
    const net = Math.round(Number(doc.sumAftDisBefVAT) * 100);
    const vat = Math.round(Number(doc.vatSum) * 100);
    if (!Number.isSafeInteger(net) || net < 0 || !Number.isSafeInteger(vat) || vat < 0 || net + vat !== event.amountAgorot) {
      throw new BadRequestException('סכומי מסמך המקור אינם תואמים לחיוב');
    }
    return { doc, net, issuer };
  }

  private async reservations(m: EntityManager, paymentId: number) {
    return m.find(BillingAttempt, { where: { operation: 'REFUND', sourcePaymentEventId: paymentId,
      status: In(REFUND_RESERVED_STATUSES) } });
  }

  private view(a: BillingAttempt) {
    return { attemptId: a.id, paymentEventId: a.sourcePaymentEventId, amountAgorot: a.amountAgorot,
      status: a.status, stateVersion: a.stateVersion, createdAt: a.createdAt,
      transactionId: a.cardcomTransactionId, receiptDocId: a.receiptDocId, reason: a.refundReason };
  }

  private async successEvent(m: EntityManager, a: BillingAttempt, source: BillingEvent) {
    const existing = await m.findOne(BillingEvent, { where: { billingAttemptId: a.id, eventType: E.REFUND_SUCCESS } });
    if (existing) return existing;
    return m.save(BillingEvent, m.create(BillingEvent, { firebaseId: source.firebaseId, subscriptionId: source.subscriptionId,
      eventType: E.REFUND_SUCCESS, billingAttemptId: a.id, amountAgorot: -a.amountAgorot,
      amountBeforeVatAgorot: -a.amountBeforeVatAgorot, vatAmountAgorot: -a.vatAmountAgorot,
      currency: a.currency, cardcomDealNumber: a.cardcomTransactionId,
      metadata: { sourcePaymentEventId: source.id, actorFirebaseId: a.requestedByFirebaseId,
        planId: source.metadata?.planId, reason: a.refundReason } }));
  }

  async context(subscriptionId: number) {
    const m = this.db.manager;
    const sub = await this.subscription(m, subscriptionId);
    const events = await m.find(BillingEvent, { where: { subscriptionId, firebaseId: sub.firebaseId, eventType: In(SUCCESS) }, order: { id: 'ASC' } });
    const seen = new Set<string>();
    const payments = [];
    for (const event of events) {
      if (event.cardcomDealNumber && seen.has(event.cardcomDealNumber)) continue;
      if (event.cardcomDealNumber) seen.add(event.cardcomDealNumber);
      let blockedReason: string | null = null;
      const reserved = await this.reservations(m, event.id);
      const reservedAgorot = reserved.reduce((sum, a) => sum + a.amountAgorot, 0);
      try { await this.payment(m, sub, event.id); await this.originalDocument(m, event); }
      catch (e) { blockedReason = e instanceof BadRequestException ? e.message : 'לא ניתן לאמת מסמך מקור'; }
      if (reserved.some(a => a.status !== S.COMPLETED)) blockedReason = 'קיים זיכוי שטרם הושלם או שתוצאתו בבירור';
      payments.push({ paymentEventId: event.id, date: event.createdAt, transactionId: event.cardcomDealNumber,
        amountAgorot: event.amountAgorot, remainingAgorot: Math.max(0, (event.amountAgorot ?? 0) - reservedAgorot), blockedReason });
    }
    const history = events.length ? await m.find(BillingAttempt, { where: { operation: 'REFUND', sourcePaymentEventId: In(events.map(e => e.id)) }, order: { id: 'DESC' } }) : [];
    return { payments: payments.reverse(), refunds: history.map(a => this.view(a)) };
  }

  async create(subscriptionId: number, actor: string, dto: CreateRefundDto) {
    dto.requestId = dto.requestId.toLowerCase();
    if (!dto.reason.trim() || dto.reason.trim().length < 3) throw new BadRequestException('נדרשת סיבת זיכוי');
    const reservation = await this.db.transaction(async m => {
      const sub = await this.subscription(m, subscriptionId, true);
      const source = await this.payment(m, sub, dto.paymentEventId);
      const previousRequest = await m.findOne(BillingAttempt, { where: { requestId: dto.requestId } });
      if (previousRequest) {
        if (previousRequest.operation !== 'REFUND' || previousRequest.sourcePaymentEventId !== source.id ||
          previousRequest.amountAgorot !== dto.amountAgorot || previousRequest.refundReason !== dto.reason.trim()) {
          throw new ConflictException('מזהה הבקשה כבר משויך לפעולה אחרת');
        }
        return { attempt: previousRequest, submit: false };
      }
      const { net } = await this.originalDocument(m, source);
      const previous = await this.reservations(m, source.id);
      if (previous.some(a => a.status !== S.COMPLETED)) throw new ConflictException('יש להשלים או לברר את הזיכוי הקיים לפני זיכוי נוסף');
      let amounts;
      try { amounts = refundBreakdown(source.amountAgorot, net,
        previous.reduce((s, a) => s + a.amountAgorot, 0), previous.reduce((s, a) => s + a.amountBeforeVatAgorot, 0), dto.amountAgorot); }
      catch { throw new BadRequestException('סכום הזיכוי חורג מהיתרה הזמינה'); }
      const attempt = await m.save(BillingAttempt, m.create(BillingAttempt, {
        operation: 'REFUND', sourcePaymentEventId: source.id, obligationId: null, planId: null,
        attemptNumber: 1, trigger: BillingAttemptTrigger.REFUND, chargeMode: BillingChargeMode.TRANSACTION_REFUND,
        requestId: dto.requestId, requestedByFirebaseId: actor, refundReason: dto.reason.trim(),
        cardcomExternalUniqTranId: randomUUID().replace(/-/g, '').slice(0, 25),
        providerTerminalRef: String(this.cardcom.getApiCredentials().terminalNumber),
        currency: 'ILS', ...amounts, status: S.PROCESSING, submittedAt: new Date(),
        leaseOwner: dto.requestId, leaseExpiresAt: new Date(Date.now() + LEASE_MS), stateVersion: 0,
      }));
      await m.save(BillingEvent, m.create(BillingEvent, { firebaseId: sub.firebaseId, subscriptionId,
        eventType: E.REFUND_REQUESTED, billingAttemptId: attempt.id, amountAgorot: -attempt.amountAgorot,
        metadata: { actorFirebaseId: actor, sourcePaymentEventId: source.id, reason: dto.reason.trim() } }));
      return { attempt, submit: true, sourceTransactionId: source.cardcomDealNumber };
    });
    if (!reservation.submit) return this.view(reservation.attempt);
    let response: { ResponseCode: number; NewTranzactionId?: number };
    try { response = await this.cardcom.refundTransaction({ transactionId: reservation.sourceTransactionId,
      amountAgorot: reservation.attempt.amountAgorot, requestId: dto.requestId }); }
    catch { response = { ResponseCode: undefined }; }
    await this.db.transaction(async m => {
      const a = await m.findOne(BillingAttempt, { where: { id: reservation.attempt.id }, lock: { mode: 'pessimistic_write' } });
      if (a.status !== S.PROCESSING || a.leaseOwner !== dto.requestId) return;
      a.providerResponseCode = Number.isInteger(response.ResponseCode) ? response.ResponseCode : null;
      // Only a documented success with a usable refund id is automatic proof.
      // Nonzero codes (including already-refunded) need review, not a blind replay.
      if (response.ResponseCode === 0 && Number.isSafeInteger(response.NewTranzactionId) && response.NewTranzactionId > 0) {
        a.cardcomTransactionId = String(response.NewTranzactionId); a.capturedAt = new Date(); a.status = S.CAPTURED;
      } else { a.status = S.UNKNOWN; a.unknownSince = new Date(); a.failureCategory = 'REFUND_RESULT_UNCONFIRMED'; }
      a.leaseOwner = null; a.leaseExpiresAt = null; a.stateVersion++;
      await m.save(BillingAttempt, a);
      if (a.status === S.CAPTURED) await this.successEvent(m, a,
        await m.findOneByOrFail(BillingEvent, { id: a.sourcePaymentEventId }));
    });
    // If a unique provider-id/DB failure occurs above, PROCESSING stays reserved;
    // expiry converts it to UNKNOWN. Never catch it as a reason to submit again.
    await this.complete(reservation.attempt.id);
    return this.view(await this.db.manager.findOneByOrFail(BillingAttempt, { id: reservation.attempt.id }));
  }

  async complete(attemptId: number) {
    const owner = randomUUID();
    const attempt = await this.db.transaction(async m => {
      const a = await m.findOne(BillingAttempt, { where: { id: attemptId, operation: 'REFUND' }, lock: { mode: 'pessimistic_write' } });
      if (!a || a.status !== S.CAPTURED || (a.leaseExpiresAt && a.leaseExpiresAt > new Date())) return null;
      a.leaseOwner = owner; a.leaseExpiresAt = new Date(Date.now() + LEASE_MS); a.stateVersion++;
      a.reconciliationAttempts = (a.reconciliationAttempts ?? 0) + 1;
      return m.save(BillingAttempt, a);
    });
    if (!attempt) return;
    try {
      const source = await this.db.manager.findOneByOrFail(BillingEvent, { id: attempt.sourcePaymentEventId });
      const { issuer } = await this.originalDocument(this.db.manager, source);
      const doc = await this.documents.createBillingSystemCredit({ issuer,
        sourceDocId: source.receiptDocId, billingAttemptId: attempt.id,
        amountAgorot: attempt.amountAgorot, amountBeforeVatAgorot: attempt.amountBeforeVatAgorot,
        vatAmountAgorot: attempt.vatAmountAgorot, reason: attempt.refundReason });
      const success = await this.db.transaction(async m => {
        const a = await m.findOne(BillingAttempt, { where: { id: attemptId }, lock: { mode: 'pessimistic_write' } });
        if (a.leaseOwner !== owner) throw new ConflictException('זיכוי בטיפול אחר');
        a.receiptDocId = doc.receiptDocId;
        await m.save(BillingAttempt, a);
        const event = await this.successEvent(m, a, source);
        event.receiptDocId = doc.receiptDocId;
        return m.save(BillingEvent, event);
      });
      await this.receipts.finalizeBillingReceiptPdfs(doc.receiptDocId, issuer, source.firebaseId);
      const fresh = await this.db.manager.findOneByOrFail(BillingAttempt, { id: attemptId });
      if (fresh.leaseOwner !== owner || fresh.leaseExpiresAt <= new Date()) throw new ConflictException('Refund finalization lease expired');
      if (!success.receiptEmailSent) {
        const sent = await this.receipts.sendReceiptEmailForPaymentEvent(success.id, issuer.issuerName);
        if (!sent.sent) throw new Error('Refund document email pending');
      }
      await this.db.transaction(async m => {
        const a = await m.findOne(BillingAttempt, { where: { id: attemptId }, lock: { mode: 'pessimistic_write' } });
        if (a.leaseOwner !== owner) throw new ConflictException('זיכוי בטיפול אחר');
        // No obligation/subscription writes in this transaction.
        a.status = S.COMPLETED; a.completedAt = new Date(); a.failureCategory = null; a.nextActionAt = null;
        a.leaseOwner = null; a.leaseExpiresAt = null; a.stateVersion++;
        await m.save(BillingAttempt, a);
      });
    } catch {
      await this.db.manager.update(BillingAttempt, { id: attemptId, operation: 'REFUND', leaseOwner: owner },
        { leaseOwner: null, leaseExpiresAt: null, failureCategory: 'REFUND_DOCUMENT_PENDING',
          nextActionAt: new Date(Date.now() + Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(attempt.reconciliationAttempts, 10))) });
    }
  }

  async resolve(subscriptionId: number, id: number, actor: string, dto: ResolveRefundDto) {
    await this.db.transaction(async m => {
      const sub = await this.subscription(m, subscriptionId, true);
      const a = await m.findOne(BillingAttempt, { where: { id, operation: 'REFUND' }, lock: { mode: 'pessimistic_write' } });
      if (!a) throw new NotFoundException('הזיכוי לא נמצא');
      await this.payment(m, sub, a.sourcePaymentEventId);
      if (a.stateVersion !== dto.expectedStateVersion || (a.leaseExpiresAt && a.leaseExpiresAt > new Date())) throw new ConflictException('הזיכוי השתנה או נמצא בטיפול; יש לרענן');
      if (dto.action === 'COMPLETE') {
        if (![S.CAPTURED, S.COMPLETED].includes(a.status)) throw new ConflictException('לא אושר החזר כספי');
        return;
      }
      if (![S.UNKNOWN, S.MANUAL_REVIEW].includes(a.status) || (dto.evidence?.trim().length ?? 0) < 10) {
        throw new BadRequestException('נדרש זיכוי בבירור ותיעוד בדיקה מול קארדקום');
      }
      if (dto.action === 'CONFIRM_REFUNDED') {
        if (!dto.transactionId || !Number.isSafeInteger(Number(dto.transactionId)) || dto.transactionId ===
          (await m.findOneByOrFail(BillingEvent, { id: a.sourcePaymentEventId })).cardcomDealNumber) throw new BadRequestException('נדרש מספר עסקת הזיכוי, לא החיוב');
        a.cardcomTransactionId = dto.transactionId; a.status = S.CAPTURED; a.capturedAt = new Date();
      } else { a.status = S.DECLINED; }
      a.stateVersion++; a.leaseOwner = null; a.leaseExpiresAt = null;
      await m.save(BillingAttempt, a);
      if (a.status === S.CAPTURED) await this.successEvent(m, a,
        await m.findOneByOrFail(BillingEvent, { id: a.sourcePaymentEventId }));
      await m.save(BillingEvent, m.create(BillingEvent, { firebaseId: sub.firebaseId, subscriptionId,
        billingAttemptId: id, eventType: dto.action === 'CONFIRM_NOT_REFUNDED' ? E.REFUND_FAILED : E.REFUND_RESOLUTION,
        metadata: { action: dto.action, evidence: dto.evidence.trim(), actorFirebaseId: actor, transactionId: dto.transactionId } }));
    });
    await this.complete(id);
    return this.view(await this.db.manager.findOneByOrFail(BillingAttempt, { id }));
  }

  @Cron('*/1 * * * *', { timeZone: 'Asia/Jerusalem' })
  async recover() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const expired = await this.db.manager.find(BillingAttempt, { where: { operation: 'REFUND', status: S.PROCESSING,
        leaseExpiresAt: LessThanOrEqual(new Date()) }, take: 20 });
      for (const a of expired) await this.db.manager.update(BillingAttempt, { id: a.id, status: S.PROCESSING, stateVersion: a.stateVersion },
        { status: S.UNKNOWN, unknownSince: new Date(), leaseOwner: null, leaseExpiresAt: null, stateVersion: a.stateVersion + 1 });
      const captured = await this.db.manager.find(BillingAttempt, { where: { operation: 'REFUND', status: S.CAPTURED,
        nextActionAt: Or(IsNull(), LessThanOrEqual(new Date())) }, take: 20, order: { id: 'ASC' } });
      for (const a of captured) await this.complete(a.id);
    } catch { this.logger.warn('Refund recovery unavailable; durable reservations remain intact'); }
    finally { this.sweeping = false; }
  }
}
