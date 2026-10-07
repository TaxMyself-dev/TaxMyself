import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { FilesService } from 'src/app/services/files.service';
import { BillingStateService } from 'src/app/services/billing-state.service';
import { MySubscriptionTabComponent } from './my-subscription-tab.component';

describe('My Subscription cancellation', () => {
  let page: MySubscriptionTabComponent, state: any, toast: jasmine.Spy;
  beforeEach(() => {
    state = { billingState: signal({ subscription: { status: 'ACTIVE', currentPeriodEnd: '2099-11-07T07:14:48Z',
      billingAccessMode: 'STANDARD' }, pendingCancellation: null }), isLoading: signal(false),
      hasBillingOverride: signal(false), cancelSubscription: jasmine.createSpy().and.resolveTo(),
      withdrawSubscriptionCancellation: jasmine.createSpy().and.resolveTo() };
    toast = jasmine.createSpy();
    TestBed.configureTestingModule({ providers: [
      { provide: BillingStateService, useValue: state }, { provide: FilesService, useValue: {} },
      { provide: Router, useValue: {} }, { provide: MessageService, useValue: { add: toast } },
    ] });
    page = TestBed.runInInjectionContext(() => new MySubscriptionTabComponent());
  });
  it('requires explicit confirmation and forwards the displayed status and paid period', async () => {
    await page.confirmCancellation();
    expect(state.cancelSubscription).not.toHaveBeenCalled();
    page.cancellationConfirmation.set(true);
    await page.confirmCancellation();
    expect(state.cancelSubscription).toHaveBeenCalledOnceWith('ACTIVE', '2099-11-07T07:14:48Z');
    expect(page.cancellationConfirmation()).toBeFalse();
  });
  it('suppresses duplicate confirmation while the request is in flight', async () => {
    let done!: () => void;
    state.cancelSubscription.and.returnValue(new Promise<void>(resolve => { done = resolve; }));
    page.cancellationConfirmation.set(true);
    const operation = page.confirmCancellation();
    await page.confirmCancellation();
    expect(state.cancelSubscription).toHaveBeenCalledTimes(1);
    done(); await operation;
  });
  it('shows the scheduled end, stops plan changes and withdraws the exact request', async () => {
    state.billingState.update((value: any) => ({ ...value, pendingCancellation: { eventId: 20, effectiveAt: '2099-11-07T07:14:48Z' } }));
    expect(page.canChangePlan()).toBeFalse();
    expect(page.canCancelSubscription()).toBeFalse();
    expect(page.nextBillingDateLabel()).toBe('לא מתוכנן חיוב נוסף');
    await page.withdrawCancellation();
    expect(state.withdrawSubscriptionCancellation).toHaveBeenCalledOnceWith(20);
  });
  it('prevents complimentary and represented users from canceling or withdrawing', async () => {
    state.hasBillingOverride.set(true);
    page.cancellationConfirmation.set(true);
    await page.confirmCancellation();
    state.billingState.update((value: any) => ({ ...value, pendingCancellation: { eventId: 20 } }));
    await page.withdrawCancellation();
    expect(state.cancelSubscription).not.toHaveBeenCalled();
    expect(state.withdrawSubscriptionCancellation).not.toHaveBeenCalled();
    state.hasBillingOverride.set(false);
    state.billingState.set({ subscription: { status: 'ACTIVE', billingAccessMode: 'COMPLIMENTARY_FULL' } });
    expect(page.canCancelSubscription()).toBeFalse();
  });
  it('surfaces unresolved payment errors without reporting cancellation success', async () => {
    state.cancelSubscription.and.rejectWith({ error: { message: 'יש להשלים בירור תשלום' } });
    page.cancellationConfirmation.set(true);
    await page.confirmCancellation();
    expect(toast).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'error', detail: 'יש להשלים בירור תשלום' }));
    expect(page.changingCancellation()).toBeFalse();
  });
});
