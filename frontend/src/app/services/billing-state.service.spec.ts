import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { BillingStateService } from './billing-state.service';
import { Subject } from 'rxjs';

describe('BillingStateService professional-access override', () => {
  let service: BillingStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BillingStateService,
        { provide: HttpClient, useValue: {} },
      ],
    });
    service = TestBed.inject(BillingStateService);
  });

  function setAccessState(isDelegatedAccess: boolean, isAdminImpersonation: boolean): void {
    service.billingState.set({
      isDelegatedAccess,
      isAdminImpersonation,
    } as any);
  }

  it('recognizes the explicit server-provided admin impersonation state', () => {
    setAccessState(false, true);
    expect(service.isAdminImpersonation()).toBeTrue();
    expect(service.hasBillingOverride()).toBeTrue();
  });

  it('does not bypass billing for a direct expired client', () => {
    setAccessState(false, false);
    expect(service.hasBillingOverride()).toBeFalse();
  });

  it('preserves the existing delegated accountant override', () => {
    setAccessState(true, false);
    expect(service.isDelegatedAccess()).toBeTrue();
    expect(service.hasBillingOverride()).toBeTrue();
  });

  it('keeps existing billing UI mounted while refreshing the returned checkout only', async () => {
    TestBed.resetTestingModule();
    const response = new Subject<any>();
    const get = jasmine.createSpy('get').and.returnValue(response);
    TestBed.configureTestingModule({ providers: [BillingStateService, { provide: HttpClient, useValue: { get } }] });
    const billing = TestBed.inject(BillingStateService);
    billing.billingState.set({ subscription: { status: 'TRIAL_EXPIRED' }, billingPaymentResult: { paymentStatus: 'SUCCESS' } } as any);
    billing.setCheckoutReturnContext('lp-current');
    expect(billing.billingPaymentResult()).toBeNull();
    const refresh = billing.refreshBillingState();
    expect(billing.isLoading()).toBeFalse();
    expect(get.calls.mostRecent().args[1]).toEqual({ params: { checkoutLowProfileId: 'lp-current' } });
    response.next({ subscription: { status: 'ACTIVE' } });
    response.complete();
    await refresh;
    expect(billing.billingState()?.subscription?.status).toBe('ACTIVE');
  });
});
