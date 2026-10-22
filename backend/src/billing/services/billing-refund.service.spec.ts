import { BillingRefundService } from './billing-refund.service';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { Subscription } from '../entities/subscription.entity';
import { Documents } from 'src/documents/documents.entity';
import { DocumentsService } from 'src/documents/documents.service';
import { BillingService } from './billing.service';
import { BillingEventService } from './billing-event.service';
import { BillingAttemptStatus as S, BillingEventType as E } from '../enums/billing.enums';
import { BusinessType, Currency, DocumentType } from 'src/enum';
import { refundBreakdown } from '../domain/billing-refund';
import { randomUUID } from 'crypto';

/** Serialized transactions stand in for MySQL row locks. Separately the guarded
 * dev schema verification exercises real UNIQUE/FK/trigger enforcement. No providers. */
function fixture() {
  const sub = { id: 7, firebaseId: 'legacy-owner', status: 'ACTIVE', nextBillingDate: new Date('2026-11-01'),
    currentPeriodEnd: new Date('2026-11-01'), planId: 3, canceledAt: null };
  const source = { id: 10, firebaseId: sub.firebaseId, subscriptionId: 7, eventType: E.PAYMENT_SUCCESS,
    amountAgorot: 11800, amountBeforeVatAgorot: null, vatAmountAgorot: null,
    cardcomDealNumber: '1234567', receiptDocId: 30, billingAttemptId: null, currency: 'ILS',
    createdAt: new Date('2026-01-01'), metadata: null };
  const original = { id: 30, issuerBusinessNumber: '999', docType: DocumentType.TAX_INVOICE_RECEIPT,
    docNumber: '40001', currency: Currency.ILS, docVatRate: 18, sumAftDisBefVAT: '100.00',
    vatSum: '18.00', sumAftDisWithVAT: '118.00', recipientName: 'Legacy Customer', recipientEmail: 'test@example.invalid', file: 'original.pdf' };
  const rows = new Map<any, any[]>([[Subscription, [sub]], [BillingEvent, [source]], [Documents, [original]], [BillingAttempt, []]]);
  let nextId = 100;
  const matches = (row: any, where: any) => Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (value && value._type === 'in') return value._value.includes(row[key]);
    if (value && value._type === 'or') return value._value.some(v => matches(row, { [key]: v }));
    if (value && value._type === 'isNull') return row[key] == null;
    if (value && value._type === 'lessThanOrEqual') return row[key] != null && row[key] <= value._value;
    return row[key] === value;
  });
  const m: any = {
    find: jest.fn(async (entity, options = {}) => (rows.get(entity) ?? []).filter(r => matches(r, options.where))
      .sort((a, b) => options.order?.id === 'DESC' ? b.id - a.id : a.id - b.id)),
    findOne: jest.fn(async (entity, options) => (await m.find(entity, options))[0] ?? null),
    findOneByOrFail: jest.fn(async (entity, where) => { const row = await m.findOne(entity, { where }); if (!row) throw Error('missing'); return row; }),
    create: (_entity, value) => ({ ...value }),
    save: jest.fn(async (entity, value) => {
      if (!value.id) { value.id = nextId++; value.createdAt ??= new Date(); value.receiptEmailSent ??= false; rows.get(entity).push(value); }
      return value;
    }),
    update: jest.fn(async (entity, where, values) => { const found = (rows.get(entity) ?? []).filter(r => matches(r, where)); found.forEach(r => Object.assign(r, values)); return { affected: found.length }; }),
  };
  let queue = Promise.resolve();
  const db: any = { manager: m, transaction: (work) => {
    const result = queue.then(() => work(m)); queue = result.then(() => {}, () => {}); return result;
  } };
  const cardcom = { getApiCredentials: () => ({ terminalNumber: 1000 }), refundTransaction: jest.fn().mockResolvedValue({ ResponseCode: 0, NewTranzactionId: 987654 }) };
  const issuer = { systemUserId: 'issuer', issuerBusinessNumber: '999', issuerBusinessType: BusinessType.LICENSED, issuerName: 'Keepintax' };
  const issuers = { getKeepintaxIssuer: jest.fn().mockResolvedValue(issuer) };
  const documentService: any = Object.create(DocumentsService.prototype);
  documentService.documentsRepo = { findOneByOrFail: (where) => m.findOneByOrFail(Documents, where) };
  documentService.findBillingReceiptByAttemptId = async (id) => {
    const doc = rows.get(Documents).find(d => d.billingAttemptId === id);
    return doc ? { receiptDocId: doc.id, docNumber: doc.docNumber, generalDocIndex: doc.generalDocIndex } : null;
  };
  documentService.getCurrentIndexes = jest.fn().mockResolvedValue({ docIndex: 50001, isInitial: false });
  documentService.createDoc = jest.fn(async (data, _issuerId, generatePdf) => {
    expect(generatePdf).toBe(false);
    expect(data.docData.parentDocNumber).toBe('40001');
    expect(data.docData.parentDocType).toBe(DocumentType.TAX_INVOICE_RECEIPT);
    expect(data.docData.docType).toBe(DocumentType.CREDIT_INVOICE);
    return m.save(Documents, { ...data.docData, generalDocIndex: '0000051' });
  });
  const receipts = { finalizeBillingReceiptPdfs: jest.fn(async (id) => { rows.get(Documents).find(d => d.id === id).file = 'credit-signed.pdf'; }),
    sendReceiptEmailForPaymentEvent: jest.fn(async (id) => { rows.get(BillingEvent).find(e => e.id === id).receiptEmailSent = true; return { sent: true }; }) };
  const service = new BillingRefundService(db, cardcom as any, documentService, receipts as any, issuers as any);
  const dto = { requestId: randomUUID(), paymentEventId: 10, amountAgorot: 11800, reason: 'Customer requested refund' };
  return { service, db, m, rows, source, original, sub, cardcom, documentService, receipts, dto };
}

describe('Refund lifecycle including legacy payments', () => {
  it('uses a historical 17% receipt rather than repricing the refund at the current VAT rate', async () => {
    const f = fixture(); f.source.amountAgorot = 11700; f.original.sumAftDisWithVAT = '117.00';
    f.original.vatSum = '17.00'; f.original.docVatRate = 17;
    await f.service.create(7, 'admin', { ...f.dto, amountAgorot: 11700 });
    expect(f.documentService.createDoc.mock.calls[0][0].docData).toMatchObject({
      docVatRate: 17, sumAftDisBefVAT: 100, vatSum: 17, sumAftDisWithVAT: 117 });
  });
  it('refunds a legacy payment with no attempt, creates one linked credit, and renders negative downloadable history without changing subscription', async () => {
    const f = fixture(); const before = structuredClone(f.sub);
    const result = await f.service.create(7, 'admin', f.dto);
    expect(result.status).toBe(S.COMPLETED);
    expect(f.source.billingAttemptId).toBeNull();
    expect(f.cardcom.refundTransaction).toHaveBeenCalledWith({ transactionId: '1234567', amountAgorot: 11800, requestId: f.dto.requestId });
    expect(f.documentService.createDoc).toHaveBeenCalledTimes(1);
    const credit = f.documentService.createDoc.mock.calls[0][0].docData;
    expect(credit).toMatchObject({ sumAftDisBefVAT: 100, vatSum: 18, sumAftDisWithVAT: 118 });
    expect(f.sub).toEqual(before);
    const events: any = Object.create(BillingEventService.prototype);
    events.billingEventRepo = { find: (options) => f.m.find(BillingEvent, options) };
    const billing: any = Object.create(BillingService.prototype);
    billing.billingEventService = events;
    billing.subscriptionRepo = { find: async () => [] }; billing.planRepo = { find: async () => [] };
    billing.documentsService = { findDownloadableBillingReceiptDocIds: async () => new Set(f.rows.get(Documents).filter(d => d.file).map(d => d.id)) };
    const history = await billing.getUserPaymentHistory('legacy-owner');
    expect(history).toContainEqual(expect.objectContaining({ amountAgorot: -11800, status: 'SUCCESS', receiptAvailable: true, canRetry: false }));
    expect(f.receipts.sendReceiptEmailForPaymentEvent).toHaveBeenCalledTimes(1);
  });

  it('serializes duplicate requests from concurrent clicks, submitting and issuing only once', async () => {
    const f = fixture();
    await Promise.all([f.service.create(7, 'admin', f.dto), f.service.create(7, 'admin', f.dto)]);
    expect(f.cardcom.refundTransaction).toHaveBeenCalledTimes(1);
    expect(f.documentService.createDoc).toHaveBeenCalledTimes(1);
  });

  it('blocks a different concurrent refund while the provider response is outstanding', async () => {
    const f = fixture(); let finish;
    f.cardcom.refundTransaction.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const first = f.service.create(7, 'admin', { ...f.dto, amountAgorot: 5900 });
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    await expect(f.service.create(7, 'admin2', { ...f.dto, requestId: randomUUID(), amountAgorot: 5900 })).rejects.toThrow('יש להשלים');
    finish({ ResponseCode: 0, NewTranzactionId: 987654 }); await first;
    expect(f.cardcom.refundTransaction).toHaveBeenCalledTimes(1);
  });

  it('never replays after timeout, including a new request id, and creates no success/document', async () => {
    const f = fixture(); f.cardcom.refundTransaction.mockRejectedValue(Error('timeout'));
    expect((await f.service.create(7, 'admin', f.dto)).status).toBe(S.UNKNOWN);
    await f.service.create(7, 'admin', f.dto);
    await expect(f.service.create(7, 'admin', { ...f.dto, requestId: randomUUID() })).rejects.toThrow('יש להשלים');
    expect(f.cardcom.refundTransaction).toHaveBeenCalledTimes(1);
    expect(f.documentService.createDoc).not.toHaveBeenCalled();
    expect(f.rows.get(BillingEvent).filter(e => e.eventType === E.REFUND_SUCCESS)).toHaveLength(0);
  });

  it('persists sanitized provider descriptions in existing audit events and exposes them on reload without changing UNKNOWN', async () => {
    const f = fixture(); f.cardcom.refundTransaction.mockResolvedValue({ ResponseCode: 671, Description: 'Provider refusal explanation', NewTranzactionId: undefined } as any);
    const result = await f.service.create(7, 'admin', f.dto);
    expect(result).toMatchObject({ status: S.UNKNOWN, providerResponseCode: 671, providerDescription: 'Provider refusal explanation' });
    const context = await f.service.context(7);
    expect(context.refunds[0].providerDescription).toBe('Provider refusal explanation');
    expect(f.rows.get(BillingEvent)).toContainEqual(expect.objectContaining({ eventType: E.REFUND_RESOLUTION,
      metadata: expect.objectContaining({ kind: 'PROVIDER_REFUND_RESPONSE', responseCode: 671, description: 'Provider refusal explanation' }) }));
  });

  it('checks original UID and refund amount read-only and never infers no refund from missing results', async () => {
    const f = fixture(); f.cardcom.refundTransaction.mockRejectedValue(Error('timeout'));
    const unknown = await f.service.create(7, 'admin', f.dto);
    const list = jest.fn().mockResolvedValueOnce({ complete: true, transactions: [{ transactionId: 1234567,
      uid: 'original-uid', responseCode: 0, isRefund: false, coinId: 1, terminal: 1000, amount: 118 }] })
      .mockResolvedValueOnce({ complete: true, transactions: [
        { transactionId: 987, uid: 'original-uid', responseCode: 0, isRefund: true, coinId: 1, terminal: 1000, amount: -118 },
        { transactionId: 988, uid: 'other-uid', responseCode: 0, isRefund: true, coinId: 1, terminal: 1000, amount: -118 },
      ] });
    (f.cardcom as any).listRefundEvidence = list;
    const savedBefore = f.m.save.mock.calls.length;
    const check = await f.service.checkProvider(7, unknown.attemptId);
    expect(check.originalVerified).toBe(true); expect(check.candidates.map(c => c.transactionId)).toEqual(['987']);
    expect(f.m.save.mock.calls.length).toBe(savedBefore); expect(f.rows.get(BillingAttempt)[0].status).toBe(S.UNKNOWN);
    expect(f.cardcom.refundTransaction).toHaveBeenCalledTimes(1);
    list.mockResolvedValue({ complete: true, transactions: [] });
    const empty = await f.service.checkProvider(7, unknown.attemptId);
    expect(empty.candidates).toEqual([]); expect(empty.message).toContain('אינה הוכחה');
    expect(f.rows.get(BillingAttempt)[0].status).toBe(S.UNKNOWN);
  });

  it('recovers PDF failure after confirmed refund, reusing the document and negative event without another provider call', async () => {
    const f = fixture(); f.receipts.finalizeBillingReceiptPdfs.mockRejectedValueOnce(Error('signer unavailable'));
    const first = await f.service.create(7, 'admin', f.dto);
    expect(first.status).toBe(S.CAPTURED);
    expect(first.completionError).toMatchObject({ stage: 'PDF_SIGN_UPLOAD', message: 'signer unavailable' });
    expect(f.receipts.sendReceiptEmailForPaymentEvent).not.toHaveBeenCalled();
    f.rows.get(BillingAttempt)[0].nextActionAt = new Date(0);
    await f.service.recover();
    expect(f.rows.get(BillingAttempt)[0].status).toBe(S.COMPLETED);
    expect((await f.service.context(7)).refunds[0].completionError).toBeNull();
    expect(f.cardcom.refundTransaction).toHaveBeenCalledTimes(1);
    expect(f.documentService.createDoc).toHaveBeenCalledTimes(1);
    expect(f.rows.get(BillingEvent).filter(e => e.eventType === E.REFUND_SUCCESS)).toHaveLength(1);
  });

  it('persists a sanitized email error without repeating the refund and exposes it after reload', async () => {
    const f = fixture();
    f.receipts.sendReceiptEmailForPaymentEvent.mockResolvedValueOnce({ sent: false, error: 'mail unavailable token=secret' } as any);
    await f.service.create(7, 'admin', f.dto);
    const result = (await f.service.context(7)).refunds[0];
    expect(result.completionError).toMatchObject({ stage: 'EMAIL', message: 'mail unavailable [redacted]' });
    expect(f.cardcom.refundTransaction).toHaveBeenCalledTimes(1);
    expect(f.rows.get(BillingEvent).filter(e => e.eventType === E.REFUND_SUCCESS)).toHaveLength(1);
  });

  it('records negative history immediately on confirmed refund even if document creation fails', async () => {
    const f = fixture(); f.documentService.createDoc.mockRejectedValueOnce(Error('document transaction failed'));
    const result = await f.service.create(7, 'admin', f.dto);
    expect(result.status).toBe(S.CAPTURED);
    expect(f.rows.get(BillingEvent)).toContainEqual(expect.objectContaining({ eventType: E.REFUND_SUCCESS,
      amountAgorot: -11800, amountBeforeVatAgorot: -10000, vatAmountAgorot: -1800 }));
    expect(f.rows.get(Documents)).toHaveLength(1);
    f.rows.get(BillingAttempt)[0].nextActionAt = new Date(0); await f.service.recover();
    expect(f.rows.get(BillingAttempt)[0].status).toBe(S.COMPLETED);
    expect(f.cardcom.refundTransaction).toHaveBeenCalledTimes(1);
    expect(f.rows.get(BillingEvent).filter(e => e.eventType === E.REFUND_SUCCESS)).toHaveLength(1);
  });

  it('blocks missing/wrong-owner original payments and missing documents before provider I/O', async () => {
    const f = fixture(); f.source.firebaseId = 'other-user';
    await expect(f.service.create(7, 'admin', f.dto)).rejects.toThrow();
    f.source.firebaseId = 'legacy-owner'; f.source.receiptDocId = 999;
    await expect(f.service.create(7, 'admin', f.dto)).rejects.toThrow();
    expect(f.cardcom.refundTransaction).not.toHaveBeenCalled();
  });

  it('rejects amount above balance and stale manual resolution; confirmed no-refund does not touch subscription', async () => {
    const f = fixture();
    await expect(f.service.create(7, 'admin', { ...f.dto, amountAgorot: 11801 })).rejects.toThrow('חורג');
    f.cardcom.refundTransaction.mockRejectedValue(Error('timeout'));
    const unknown = await f.service.create(7, 'admin', f.dto);
    await expect(f.service.resolve(7, unknown.attemptId, 'admin', { action: 'CONFIRM_NOT_REFUNDED', expectedStateVersion: 0, evidence: 'Provider confirmed request was not executed' })).rejects.toThrow('השתנה');
    const before = structuredClone(f.sub);
    const resolved = await f.service.resolve(7, unknown.attemptId, 'admin', { action: 'CONFIRM_NOT_REFUNDED', expectedStateVersion: unknown.stateVersion, evidence: 'Provider confirmed request was not executed' });
    expect(resolved.status).toBe(S.DECLINED); expect(f.sub).toEqual(before);
  });

  it('expires an interrupted submission to UNKNOWN without any resubmission', async () => {
    const f = fixture(); f.rows.get(BillingAttempt).push({ id: 200, operation: 'REFUND', status: S.PROCESSING,
      leaseExpiresAt: new Date(0), stateVersion: 0 });
    await f.service.recover();
    expect(f.rows.get(BillingAttempt)[0].status).toBe(S.UNKNOWN);
    expect(f.cardcom.refundTransaction).not.toHaveBeenCalled();
  });
});

describe('Partial refund VAT allocation', () => {
  it('preserves exact original VAT across rounded partial refunds', () => {
    let gross = 0, net = 0;
    for (const amount of [1, 7, 19, 11773]) {
      const next = refundBreakdown(11800, 10000, gross, net, amount);
      gross += next.amountAgorot; net += next.amountBeforeVatAgorot;
    }
    expect({ gross, net }).toEqual({ gross: 11800, net: 10000 });
    expect(() => refundBreakdown(11800, 10000, gross, net, 1)).toThrow();
  });
});
