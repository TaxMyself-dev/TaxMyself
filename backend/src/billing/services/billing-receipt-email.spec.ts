import { BillingService } from './billing.service';
import { BillingEventService } from './billing-event.service';
import { BillingReceiptService } from './billing-receipt.service';
import { AdminBillingService } from './admin-billing.service';
import { AdminBillingController } from '../admin-billing.controller';
import { BillingEventType } from '../enums/billing.enums';
import { DocumentType } from 'src/enum';

describe('durable receipt email delivery', () => {
  const now = new Date('2026-11-01T10:00:00Z');
  function fixture() {
    const event: any = { id: 108, eventType: BillingEventType.RENEWAL_SUCCESS, receiptDocId: 243,
      receiptEmailSent: false, metadata: { attemptId: 3, receiptEmail: { sent: false, attempts: 1, lastError: 'socket hang up' } } };
    const manager = { findOne: jest.fn(async () => event), save: jest.fn(async () => event) };
    const repo = { manager: { transaction: jest.fn(async cb => cb(manager)) } };
    return { event, manager, service: new BillingEventService(repo as any) };
  }
  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('claims a legacy renewal failure, blocks concurrent manual/automatic delivery, persists retry and clears on success', async () => {
    const { event, manager, service } = fixture();
    const lease = await service.claimReceiptEmail(108);
    expect(lease).toBeTruthy();
    expect(manager.findOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(event.metadata.attemptId).toBe(3);
    expect(await service.claimReceiptEmail(108, true)).toBeNull();
    await service.finishReceiptEmail(108, lease!, false, 'socket hang up');
    expect(event.metadata.receiptEmail.nextAttemptAt).toBe('2026-11-01T10:05:00.000Z');
    expect(await service.claimReceiptEmail(108)).toBeNull();
    jest.advanceTimersByTime(5 * 60000);
    const second = await service.claimReceiptEmail(108);
    await service.finishReceiptEmail(108, second!, true);
    expect(event.receiptEmailSent).toBe(true);
    expect(event.metadata.receiptEmail).toMatchObject({ sent: true, lastError: null, nextAttemptAt: null, leaseUntil: null });
    expect(await service.claimReceiptEmail(108)).toBeNull();
  });
  it('makes crash recovery durable before sending and rejects stale finishers', async () => {
    const { event, service } = fixture();
    const old = await service.claimReceiptEmail(108);
    expect(event.metadata.receiptEmail.nextAttemptAt).toBe('2026-11-01T10:10:00.000Z');
    jest.advanceTimersByTime(10 * 60000);
    const current = await service.claimReceiptEmail(108);
    expect(current).not.toBe(old);
    await service.finishReceiptEmail(108, old!, true);
    expect(event.receiptEmailSent).toBe(false);
    expect(event.metadata.receiptEmail.leaseId).toBe(current);
  });
  it('does not retry no-recipient skips until an explicit admin retry', async () => {
    const { service } = fixture();
    const lease = await service.claimReceiptEmail(108);
    await service.finishReceiptEmail(108, lease!, false, undefined, true);
    expect(await service.claimReceiptEmail(108)).toBeNull();
    expect(await service.claimReceiptEmail(108, true, now, 'admin')).toBeTruthy();
  });
  it('fails closed when a lease cannot be persisted', async () => {
    const { service, manager } = fixture();
    manager.save.mockRejectedValueOnce(new Error('DB unavailable'));
    await expect(service.claimReceiptEmail(108)).rejects.toThrow('DB unavailable');
  });
  it.each([1, 2, 3, 4, 5, 6])('uses bounded backoff for run %i', async run => {
    const { event, service } = fixture();
    event.metadata.receiptEmail.attempts = run - 1;
    const lease = await service.claimReceiptEmail(108);
    await service.finishReceiptEmail(108, lease!, false, 'failure');
    const minutes = [1, 5, 15, 30, 60, 60][run - 1];
    expect(Date.parse(event.metadata.receiptEmail.nextAttemptAt)).toBe(now.getTime() + minutes * 60000);
  });
});

describe('existing PDF email pipeline', () => {
  function fixture() {
    const documents = { getBillingReceiptPdf: jest.fn().mockResolvedValue({ buffer: Buffer.from('existing PDF'), recipientEmail: 'test@example.com',
      recipientName: 'Test', docNumber: '30017', docType: 'TAX_INVOICE_RECEIPT', generalDocIndex: '1' }) };
    const mail = { sendMailWithAttachment: jest.fn().mockResolvedValue({ messageId: 'message' }) };
    const events = { claimReceiptEmail: jest.fn().mockResolvedValue('lease'),
      findPaymentEventById: jest.fn().mockResolvedValue({ id: 108, receiptDocId: 243, eventType: BillingEventType.RENEWAL_SUCCESS }),
      finishReceiptEmail: jest.fn().mockResolvedValue(undefined) };
    return { documents, mail, events, service: new BillingReceiptService(documents as any, mail as any, events as any, {} as any, {} as any) };
  }
  it('retries failed mail using the same stored PDF; performs no PDF generation', async () => {
    const { documents, mail, events, service } = fixture();
    mail.sendMailWithAttachment.mockRejectedValueOnce(new Error('socket hang up'));
    expect((await service.sendReceiptEmailForPaymentEvent(108, 'Keepintax')).sent).toBe(false);
    expect(events.finishReceiptEmail).toHaveBeenLastCalledWith(108, 'lease', false, 'socket hang up');
    expect((await service.sendReceiptEmailForPaymentEvent(108, 'Keepintax')).sent).toBe(true);
    expect(documents.getBillingReceiptPdf.mock.calls).toEqual([[243], [243]]);
    expect(mail.sendMailWithAttachment.mock.calls[1][1]).toBe('חשבונית מס קבלה #30017');
  });
  it('retains an explicit no-recipient skip on subsequent capture completion', async () => {
    const { documents, mail, events, service } = fixture();
    events.claimReceiptEmail.mockResolvedValue(null);
    events.findPaymentEventById.mockResolvedValue({ receiptDocId: 243, metadata: { receiptEmail: { skipped: 'NO_RECIPIENT' } } } as any);
    expect(await service.sendReceiptEmailForPaymentEvent(108, 'Keepintax')).toEqual({ sent: false });
    expect(documents.getBillingReceiptPdf).not.toHaveBeenCalled();
    expect(mail.sendMailWithAttachment).not.toHaveBeenCalled();
  });
  it('never sends while another caller owns delivery', async () => {
    const { documents, mail, events, service } = fixture();
    events.claimReceiptEmail.mockResolvedValue(null);
    await service.sendReceiptEmailForPaymentEvent(108, 'Keepintax', { manual: true });
    expect(documents.getBillingReceiptPdf).not.toHaveBeenCalled();
    expect(mail.sendMailWithAttachment).not.toHaveBeenCalled();
  });
  it('does not acknowledge success if the success write fails', async () => {
    const { events, service } = fixture();
    events.finishReceiptEmail.mockRejectedValueOnce(new Error('DB unavailable'));
    expect((await service.sendReceiptEmailForPaymentEvent(108, 'Keepintax')).sent).toBe(false);
  });
});

describe('admin resend existing invoice', () => {
  function fixture() {
    const event: any = { id: 108, eventType: BillingEventType.RENEWAL_SUCCESS, receiptDocId: 243, billingAttemptId: 3 };
    const events = { findPaymentEventById: jest.fn().mockResolvedValue(event) };
    const receipts = { sendReceiptEmailForPaymentEvent: jest.fn().mockResolvedValue({ sent: true }) };
    const issuers = { getKeepintaxIssuer: jest.fn().mockResolvedValue({ issuerName: 'Keepintax', issuerBusinessNumber: '517134789' }) };
    const doc: any = { file: 'existing.pdf', issuerBusinessNumber: '517134789', docType: DocumentType.TAX_INVOICE_RECEIPT, billingAttemptId: 3 };
    const dataSource = { manager: { findOne: jest.fn().mockResolvedValue(doc) } };
    const service = new AdminBillingService({} as any, {} as any, dataSource as any, {} as any, events as any, receipts as any, issuers as any, {} as any);
    return { event, receipts, doc, service };
  }
  it.each([BillingEventType.PAYMENT_SUCCESS, BillingEventType.RENEWAL_SUCCESS])('resends %s using its existing document only', async type => {
    const { event, receipts, service } = fixture(); event.eventType = type;
    await expect(service.resendReceiptEmail(108, 'admin')).resolves.toEqual({ sent: true });
    expect(receipts.sendReceiptEmailForPaymentEvent).toHaveBeenCalledWith(108, 'Keepintax', { manual: true, actor: 'admin' });
  });
  it('rejects missing documents, non-payment events and mismatched provenance', async () => {
    const { event, receipts, doc, service } = fixture();
    event.receiptDocId = null;
    await expect(service.resendReceiptEmail(108, 'admin')).rejects.toThrow();
    event.receiptDocId = 243; event.eventType = BillingEventType.REFUND_SUCCESS;
    await expect(service.resendReceiptEmail(108, 'admin')).rejects.toThrow();
    event.eventType = BillingEventType.RENEWAL_SUCCESS; doc.billingAttemptId = 9;
    await expect(service.resendReceiptEmail(108, 'admin')).rejects.toThrow();
    expect(receipts.sendReceiptEmailForPaymentEvent).not.toHaveBeenCalled();
  });
  it('checks the real admin identity before sending', async () => {
    const service = { resendReceiptEmail: jest.fn() };
    const users = { isAdmin: jest.fn().mockResolvedValue(false) };
    const controller = new AdminBillingController(service as any, users as any);
    await expect(controller.resendReceiptEmail({ user: { actorFirebaseId: 'not-admin', firebaseId: 'admin-client' } } as any, 108)).rejects.toThrow();
    expect(service.resendReceiptEmail).not.toHaveBeenCalled();
    users.isAdmin.mockResolvedValue(true);
    await controller.resendReceiptEmail({ user: { actorFirebaseId: 'admin', firebaseId: 'client' } } as any, 108);
    expect(service.resendReceiptEmail).toHaveBeenCalledWith(108, 'admin');
  });
});

describe('existing customer resend compatibility', () => {
  it('retains explicit resend intent without broadening customer event ownership/type permissions', async () => {
    const context = {
      billingEventService: { findPaymentEventById: jest.fn().mockResolvedValue({ id: 108,
        firebaseId: 'owner', receiptDocId: 243, eventType: BillingEventType.PAYMENT_SUCCESS }) },
      billingIssuerConfigService: { getKeepintaxIssuer: jest.fn().mockResolvedValue({ issuerName: 'Keepintax' }) },
      billingReceiptService: { sendReceiptEmailForPaymentEvent: jest.fn().mockResolvedValue({ sent: true }) },
    };
    await BillingService.prototype.resendReceiptEmail.call(context, 'owner', 108);
    expect(context.billingReceiptService.sendReceiptEmailForPaymentEvent).toHaveBeenCalledWith(108, 'Keepintax', { manual: true, actor: 'owner' });
    await expect(BillingService.prototype.resendReceiptEmail.call(context, 'other', 108)).rejects.toThrow();
    expect(context.billingReceiptService.sendReceiptEmailForPaymentEvent).toHaveBeenCalledTimes(1);
  });
});
