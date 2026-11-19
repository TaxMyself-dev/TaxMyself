import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { convertToParamMap } from '@angular/router';
import { BillingStateService } from '../../services/billing-state.service';
import { StartupService } from '../../services/startup.service';
import { BillingGuard } from './billing.guard';

describe('BillingGuard professional-access override', () => {
  let guard: BillingGuard;
  let router: Router;
  let billingState: {
    loadBillingState: jasmine.Spy;
    billingState: jasmine.Spy;
    hasBillingOverride: jasmine.Spy;
    effectiveStatus: jasmine.Spy;
    isPaymentRequired: jasmine.Spy;
  };

  beforeEach(() => {
    billingState = {
      loadBillingState: jasmine.createSpy().and.resolveTo(),
      billingState: jasmine.createSpy().and.returnValue({}),
      hasBillingOverride: jasmine.createSpy().and.returnValue(false),
      effectiveStatus: jasmine.createSpy().and.returnValue('TRIAL_EXPIRED'),
      isPaymentRequired: jasmine.createSpy().and.returnValue(true),
    };

    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        BillingGuard,
        { provide: BillingStateService, useValue: billingState },
        { provide: StartupService, useValue: { whenReady: () => Promise.resolve() } },
      ],
    });

    guard = TestBed.inject(BillingGuard);
    router = TestBed.inject(Router);
  });

  async function activate(url: string, query: Record<string, string> = {}): Promise<boolean | UrlTree> {
    return guard.canActivate({ queryParams: query, queryParamMap: convertToParamMap(query) } as any, { url } as any);
  }

  it('allows an admin impersonating an expired client to enter protected routes', async () => {
    billingState.hasBillingOverride.and.returnValue(true);
    expect(await activate('/transactions')).toBeTrue();
  });

  it('still redirects the same expired client when accessing directly', async () => {
    const result = await activate('/transactions');
    expect(result instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(result as UrlTree)).toBe('/my-account');
  });

  it('preserves access for an accountant using an active delegation', async () => {
    billingState.hasBillingOverride.and.returnValue(true);
    expect(await activate('/book-keeping/expenses')).toBeTrue();
  });

  it('intercepts a CardCom dashboard return before the dashboard component renders', async () => {
    const result = await activate('/my-account?LowProfileCode=lp-1&ResponseCode=0', {
      LowProfileCode: 'lp-1', ResponseCode: '0',
    });
    expect(router.serializeUrl(result as UrlTree)).toContain('/billing/payment-status');
    expect(router.serializeUrl(result as UrlTree)).toContain('LowProfileCode=lp-1');
  });

  it('recovers a server-owned pending checkout after a later login', async () => {
    billingState.billingState.and.returnValue({ pendingCheckout: { status: 'PENDING', flow: 'PLANS' } });
    const result = await activate('/my-account');
    expect(router.serializeUrl(result as UrlTree)).toBe('/billing/payment-status');
  });
});
