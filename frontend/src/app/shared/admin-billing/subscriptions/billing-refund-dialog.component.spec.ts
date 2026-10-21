import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { BillingRefundDialogComponent } from './billing-refund-dialog.component';
import { AdminBillingService, RefundContext } from 'src/app/services/admin-billing.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('Admin refund dialog', () => {
  const context: RefundContext = { payments: [{ paymentEventId: 10, date: '2026-01-01', transactionId: '123',
    amountAgorot: 11800, remainingAgorot: 11800, blockedReason: null }], refunds: [] };
  let api: any;
  function component() {
    return TestBed.runInInjectionContext(() => { const c = new BillingRefundDialogComponent(); c.subscriptionId = 7; c.ngOnInit(); return c; });
  }
  beforeEach(() => {
    api = { getRefundContext: jasmine.createSpy().and.returnValue(of(context)),
      createRefund: jasmine.createSpy(), resolveRefund: jasmine.createSpy() };
    TestBed.configureTestingModule({ imports: [BillingRefundDialogComponent, NoopAnimationsModule],
      providers: [{ provide: AdminBillingService, useValue: api }] });
  });
  it('accepts an old payment from history and submits exact agorot only after confirmation', () => {
    const c = component(); c.selectPayment(10); c.amount = '11.80'; c.reason = 'החזר חלקי';
    expect(c.canSubmit()).toBeFalse(); c.confirmed = true;
    api.createRefund.and.returnValue(of({ status: 'COMPLETED' })); c.submit();
    expect(api.createRefund).toHaveBeenCalledWith(7, jasmine.objectContaining({ paymentEventId: 10, amountAgorot: 1180, reason: 'החזר חלקי' }));
    expect(c.message()).toContain('הושלמו');
  });
  it('suppresses double clicks and keeps the same request id when a transport error is retried', () => {
    const c = component(); c.selectPayment(10); c.reason = 'בקשת לקוח'; c.confirmed = true;
    const response = new Subject<any>(); api.createRefund.and.returnValue(response);
    c.submit(); c.submit(); expect(api.createRefund).toHaveBeenCalledTimes(1);
    const requestId = api.createRefund.calls.mostRecent().args[1].requestId;
    response.error({}); c.confirmed = true;
    api.createRefund.and.returnValue(throwError(() => ({}))); c.submit();
    expect(api.createRefund.calls.mostRecent().args[1].requestId).toBe(requestId);
  });
  it('rejects amounts beyond balance and malformed fractions, or a blocked payment', () => {
    const c = component(); c.selectPayment(10); c.reason = 'בקשת לקוח'; c.confirmed = true;
    for (const value of ['118.01', '-1', '1.001', '1e2', 'NaN']) { c.amount = value; expect(c.canSubmit()).toBeFalsy(); }
    c.amount = '118'; c.context.set({ ...context, payments: [{ ...context.payments[0], blockedReason: 'בבירור' }] });
    expect(c.canSubmit()).toBeFalsy();
  });
  it('completes a confirmed refund through recovery rather than createRefund', () => {
    const c = component(); api.resolveRefund.and.returnValue(of({ status: 'COMPLETED' }));
    c.resolve({ attemptId: 22, stateVersion: 4 } as any, 'COMPLETE');
    expect(api.resolveRefund).toHaveBeenCalledWith(7, 22, { action: 'COMPLETE', expectedStateVersion: 4 });
    expect(api.createRefund).not.toHaveBeenCalled();
  });
  it('renders the RTL popup with original payment selection and an explicit unchanged-subscription notice', async () => {
    const fixture = TestBed.createComponent(BillingRefundDialogComponent);
    fixture.componentInstance.subscriptionId = 7; fixture.componentInstance.userName = 'לקוח בדיקה';
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('המנוי והחיובים העתידיים יישארו ללא שינוי');
    expect(fixture.nativeElement.querySelector('select[name="payment"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBeTrue();
    fixture.destroy();
  });
});
