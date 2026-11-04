import { BillingCompletionRecoveryService } from './billing-completion-recovery.service';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingAttemptStatus, BillingChargeMode, BillingEventType } from '../enums/billing.enums';

describe('queue-driven captured completion and email recovery', () => {
  function fixture() {
    const now = new Date('2026-11-02T10:00:00Z');
    const attempt: any = { id: 3, obligationId: 1, operation: 'CHARGE', status: BillingAttemptStatus.CAPTURED,
      chargeMode: BillingChargeMode.TOKEN_TRANSACTION };
    const manager = { findOne: jest.fn(async entity => entity === BillingAttempt ? attempt : { subscriptionId: 52, firebaseIdSnapshot: 'owner' }),
      find: jest.fn().mockResolvedValue([]) };
    const events = { findReceiptTaskEvent: jest.fn().mockResolvedValue({ id: 108, receiptDocId: 243,
      eventType: BillingEventType.RENEWAL_SUCCESS, receiptEmailSent: false, metadata: {} }),
      findDueReceiptEmails: jest.fn().mockResolvedValue([]) };
    const receipts = { sendReceiptEmailForPaymentEvent: jest.fn().mockResolvedValue({ sent: true }) };
    const issuers = { getKeepintaxIssuer: jest.fn().mockResolvedValue({ issuerName: 'Keepintax' }) };
    const hosted = { completeCapturedHostedAttempt: jest.fn().mockResolvedValue('COMPLETED') };
    const renewal = { completeCapturedAttempt: jest.fn().mockResolvedValue('COMPLETED') };
    const tasks = { enabled: true, enqueue: jest.fn().mockResolvedValue(true) };
    const service = new BillingCompletionRecoveryService(hosted as any, renewal as any,
      events as any, receipts as any, issuers as any, tasks as any, { manager } as any);
    return { now, attempt, manager, events, receipts, issuers, hosted, renewal, tasks, service };
  }
  it('routes captures to completion-only ports, and duplicate terminal delivery is a no-op', async () => {
    const f = fixture(); await f.service.handle('CAPTURE', 3, f.now);
    expect(f.renewal.completeCapturedAttempt).toHaveBeenCalledWith(3, true);
    f.attempt.chargeMode = BillingChargeMode.LOW_PROFILE_HOSTED;
    await f.service.handle('CAPTURE', 3, f.now);
    expect(f.hosted.completeCapturedHostedAttempt).toHaveBeenCalledWith({ firebaseId: 'owner', subscriptionId: 52, billingAttemptId: 3, scheduledOnly: true });
    f.attempt.status = BillingAttemptStatus.COMPLETED;
    await f.service.handle('CAPTURE', 3, f.now);
    expect(f.renewal.completeCapturedAttempt).toHaveBeenCalledTimes(1);
    expect(f.hosted.completeCapturedHostedAttempt).toHaveBeenCalledTimes(1);
  });
  it.each(['UNKNOWN', 'DECLINED', 'MANUAL_REVIEW'])('never replays %s as a charge', async status => {
    const f = fixture(); f.attempt.status = status; await f.service.handle('CAPTURE', 3, f.now);
    expect(f.renewal.completeCapturedAttempt).not.toHaveBeenCalled(); expect(f.hosted.completeCapturedHostedAttempt).not.toHaveBeenCalled();
  });
  it('never processes refunds or future/live-lease captures', async () => {
    const f = fixture(); f.attempt.operation = 'REFUND'; await f.service.handle('CAPTURE', 3, f.now);
    f.attempt.operation = 'CHARGE'; f.attempt.nextActionAt = new Date(f.now.getTime() + 60000);
    await expect(f.service.handle('CAPTURE', 3, f.now)).rejects.toThrow(); f.attempt.nextActionAt = null;
    f.attempt.leaseExpiresAt = new Date(f.now.getTime() + 60000);
    await expect(f.service.handle('CAPTURE', 3, f.now)).rejects.toThrow();
    expect(f.renewal.completeCapturedAttempt).not.toHaveBeenCalled();
  });
  it.each(['RECEIPT_PENDING', 'LEASE_HELD', 'RETRY_SCHEDULED'])('returns retryable failure for %s instead of acknowledging lost work', async status => {
    const f = fixture(); f.renewal.completeCapturedAttempt.mockResolvedValue(status);
    await expect(f.service.handle('CAPTURE', 3, f.now)).rejects.toThrow();
  });
  it('retries the existing PDF email independently of a completed/legacy attempt', async () => {
    const f = fixture(); f.attempt.status = BillingAttemptStatus.COMPLETED;
    f.receipts.sendReceiptEmailForPaymentEvent.mockResolvedValueOnce({ sent: false, error: 'mail unavailable' } as any);
    await expect(f.service.handle('MAIL', 108)).rejects.toThrow(); await f.service.handle('MAIL', 108);
    expect(f.receipts.sendReceiptEmailForPaymentEvent).toHaveBeenCalledWith(108, 'Keepintax');
    expect(f.manager.findOne).not.toHaveBeenCalled(); expect(f.renewal.completeCapturedAttempt).not.toHaveBeenCalled();
  });
  it('propagates DB failure but acknowledges missing or already delivered mail', async () => {
    const f = fixture(); f.events.findReceiptTaskEvent.mockRejectedValueOnce(new Error('DB unavailable'));
    await expect(f.service.handle('MAIL', 108)).rejects.toThrow('DB unavailable');
    f.events.findReceiptTaskEvent.mockResolvedValueOnce(null); await f.service.handle('MAIL', 108);
    f.events.findReceiptTaskEvent.mockResolvedValueOnce({ receiptEmailSent: true, eventType: BillingEventType.RENEWAL_SUCCESS } as any);
    await f.service.handle('MAIL', 108); expect(f.receipts.sendReceiptEmailForPaymentEvent).not.toHaveBeenCalled();
  });
  it('daily repair enqueues only; capture-list failure does not block mail repair', async () => {
    const f = fixture(); f.manager.find.mockRejectedValueOnce(new Error('capture query unavailable'));
    f.events.findDueReceiptEmails.mockResolvedValue([{ id: 108 }]); await expect(f.service.recover(f.now)).rejects.toThrow();
    expect(f.tasks.enqueue).toHaveBeenCalledWith('MAIL', 108, f.now, 'repair-2026-11-02');
    expect(f.receipts.sendReceiptEmailForPaymentEvent).not.toHaveBeenCalled(); expect(f.renewal.completeCapturedAttempt).not.toHaveBeenCalled();
  });
  it('paginates beyond the first page so older failures cannot starve newer work', async () => {
    const f = fixture(); f.manager.find.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }))).mockResolvedValueOnce([{ id: 101 }]);
    await f.service.recover(f.now);
    expect(f.tasks.enqueue).toHaveBeenCalledTimes(101);
    expect(f.manager.find.mock.calls[1][1].where.id.value).toBe(100);
    expect(f.tasks.enqueue).toHaveBeenCalledWith('CAPTURE', 101, f.now, 'repair-2026-11-02');
  });
  it('is opt-in, excludes overlapping scans, and releases its process guard', async () => {
    const f = fixture(); f.tasks.enabled = false; await f.service.recover(f.now); expect(f.manager.find).not.toHaveBeenCalled();
    await expect(f.service.handle('CAPTURE', 3)).rejects.toThrow(); f.tasks.enabled = true;
    let release: any; f.manager.find.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = f.service.recover(f.now); await f.service.recover(f.now); expect(f.manager.find).toHaveBeenCalledTimes(1);
    release([]); await first; await f.service.recover(f.now); expect(f.manager.find).toHaveBeenCalledTimes(2);
  });
});
