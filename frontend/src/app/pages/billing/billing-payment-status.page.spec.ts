import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BillingPaymentStatusPage } from './billing-payment-status.page';
import { BillingStateService } from '../../services/billing-state.service';

describe('BillingPaymentStatusPage', () => {
  let billing: any;
  let router: any;

  function create(params: Record<string, string> = {}) {
    billing = {
      getCheckoutResolution: jasmine.createSpy().and.resolveTo({ status: 'PENDING', flow: 'PLANS', lowProfileId: 'lp-1' }),
      refreshBillingState: jasmine.createSpy().and.resolveTo(),
      isPaymentRequired: jasmine.createSpy().and.returnValue(false),
      setCheckoutReturnContext: jasmine.createSpy(),
    };
    router = { navigate: jasmine.createSpy().and.resolveTo(true) };
    TestBed.configureTestingModule({ providers: [
      { provide: BillingStateService, useValue: billing },
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(params) } } },
    ] });
    const page = TestBed.runInInjectionContext(() => new BillingPaymentStatusPage());
    return page;
  }

  afterEach(() => {
    sessionStorage.removeItem('tm.checkoutLowProfileId');
    TestBed.resetTestingModule();
  });

  it('checks the exact returned checkout and stays off the dashboard while pending', async () => {
    const page = create({ lowprofilecode: 'lp-1' });
    page.ngOnInit();
    await Promise.resolve(); await Promise.resolve();
    expect(billing.getCheckoutResolution).toHaveBeenCalledWith('lp-1');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(page.terminal()).toBeNull();
    (page as any).stopped = true;
  });

  it('navigates home only after completion and refreshed non-blocking billing state', async () => {
    const page = create({ lowProfileId: 'lp-1' });
    billing.getCheckoutResolution.and.resolveTo({ status: 'COMPLETED', flow: 'PLANS', lowProfileId: 'lp-1' });
    await page.checkNow();
    expect(billing.refreshBillingState).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/my-account'], { replaceUrl: true });
  });

  it('does not enter the dashboard when completion did not clear the billing block', async () => {
    const page = create();
    billing.isPaymentRequired.and.returnValue(true);
    billing.getCheckoutResolution.and.resolveTo({ status: 'COMPLETED', flow: 'PLANS', lowProfileId: 'lp-1' });
    await page.checkNow();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(page.terminal()).toBe('SUCCESS_BLOCKED');
  });

  it('turns prolonged pending into an explanatory state while keeping the same attempt', async () => {
    const page = create();
    (page as any).startedAt = Date.now() - 91_000;
    await page.checkNow();
    expect(page.delayed()).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
    (page as any).stopped = true;
  });

  it('recovers from server state when browser storage and return parameters are absent', async () => {
    const page = create();
    await page.checkNow();
    expect(billing.getCheckoutResolution).toHaveBeenCalledWith(null);
    expect(router.navigate).not.toHaveBeenCalled();
    (page as any).stopped = true;
  });
});
