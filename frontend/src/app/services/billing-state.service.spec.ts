import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { BillingStateService } from './billing-state.service';

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
});
