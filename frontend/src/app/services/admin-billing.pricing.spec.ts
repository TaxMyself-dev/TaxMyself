import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminBillingService } from './admin-billing.service';

describe('AdminBillingService pricing contract', () => {
  let service: AdminBillingService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminBillingService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('sends zero and date-only expiry unchanged', () => {
    const payload = { pricePolicy: 'FROZEN' as const, customMonthlyPriceAgorot: 0,
      customPriceStartDate: '2026-11-05', customPriceEndDate: '2026-12-31' };
    service.updateSubscriptionPricing(7, payload).subscribe();
    const req = http.expectOne(r => r.url.endsWith('/admin/billing/subscriptions/7/pricing'));
    expect(req.request.method).toBe('PATCH'); expect(req.request.body).toEqual(payload); req.flush({});
  });
  it('reads pricing and plan impact without mutation, deletes only the selected plan', () => {
    service.getSubscriptionPricing(7).subscribe();
    let req = http.expectOne(r => r.url.endsWith('/admin/billing/subscriptions/7/pricing'));
    expect(req.request.method).toBe('GET'); req.flush({});
    service.getPlanPriceImpact(3).subscribe();
    req = http.expectOne(r => r.url.endsWith('/admin/billing/plans/3/impact'));
    expect(req.request.method).toBe('GET'); req.flush({});
    service.deletePlan(3).subscribe();
    req = http.expectOne(r => r.url.endsWith('/admin/billing/plans/3'));
    expect(req.request.method).toBe('DELETE'); req.flush({});
  });
});
