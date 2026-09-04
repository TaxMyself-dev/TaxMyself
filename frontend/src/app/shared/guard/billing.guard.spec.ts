import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
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
  };

  beforeEach(() => {
    billingState = {
      loadBillingState: jasmine.createSpy().and.resolveTo(),
      billingState: jasmine.createSpy().and.returnValue({}),
      hasBillingOverride: jasmine.createSpy().and.returnValue(false),
      effectiveStatus: jasmine.createSpy().and.returnValue('TRIAL_EXPIRED'),
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

  async function activate(url: string): Promise<boolean | UrlTree> {
    return guard.canActivate({} as any, { url } as any);
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
});
