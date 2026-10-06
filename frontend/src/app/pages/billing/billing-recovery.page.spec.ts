import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { BillingRecoveryPage } from './billing-recovery.page';
import { BillingStateService } from '../../services/billing-state.service';
import { environment } from 'src/environments/environment';

describe('BillingRecoveryPage', () => {
  let http: HttpTestingController;
  let page: BillingRecoveryPage;
  let state: any;

  beforeEach(() => {
    state = { billingState: signal({ subscription: { status: 'PAST_DUE' }, plan: { id: 3, name: 'Basic' } }),
      loadBillingState: jasmine.createSpy().and.resolveTo(), hasBillingOverride: () => false };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: BillingStateService, useValue: state }] });
    http = TestBed.inject(HttpTestingController);
    page = TestBed.runInInjectionContext(() => new BillingRecoveryPage());
  });

  afterEach(() => http.verify());

  async function loadDebt() {
    page.ngOnInit();
    await Promise.resolve();
    http.expectOne(`${environment.apiUrl}billing/checkout/preview`).flush({ finalAmountAgorot: 11800, currency: 'ILS',
      recoveryQuote: 'a'.repeat(64), periods: [{ periodStart: '2026-09-15', periodEnd: '2026-10-15', amountAgorot: 11800 }] });
    await Promise.resolve();
  }

  it('shows the server debt amount and does not initiate payment while loading', async () => {
    await page.pay();
    http.expectNone(`${environment.apiUrl}billing/checkout`);
    await loadDebt();
    expect(page.amountLabel()).toBe('118.00');
    expect(page.loading()).toBeFalse();
  });

  it('blocks payment when the subscription no longer has a debt', async () => {
    state.billingState.set({ subscription: { status: 'ACTIVE' }, plan: { id: 3 } });
    page.ngOnInit();
    await Promise.resolve();
    await page.pay();
    expect(page.error()).toBeTruthy();
    http.expectNone(`${environment.apiUrl}billing/checkout/preview`);
    http.expectNone(`${environment.apiUrl}billing/checkout`);
  });

  it('blocks delegated or impersonated payment', async () => {
    state.hasBillingOverride = () => true;
    page.ngOnInit();
    await Promise.resolve();
    await page.pay();
    http.expectNone(`${environment.apiUrl}billing/checkout/preview`);
    expect(page.error()).toBeTruthy();
    page.openCardChange();
    expect(page.changeCardDialogOpen).toBeFalse();
  });

  it('explains a pending payment instead of reporting a debt-loading failure', async () => {
    page.ngOnInit();
    await Promise.resolve();
    http.expectOne(`${environment.apiUrl}billing/checkout/preview`).flush({
      code: 'BILLING_PAYMENT_PENDING', message: 'התשלום ממתין לבדיקת תמיכה',
    }, { status: 409, statusText: 'Conflict' });
    await Promise.resolve();
    expect(page.error()).toBe('התשלום ממתין לבדיקת תמיכה');
    await page.pay();
    http.expectNone(`${environment.apiUrl}billing/checkout`);
  });

  it('allows card replacement for a blocked owner even when debt preview needs review', async () => {
    page.ngOnInit();
    await Promise.resolve();
    http.expectOne(`${environment.apiUrl}billing/checkout/preview`).flush({}, { status: 409, statusText: 'Conflict' });
    await Promise.resolve();
    page.openCardChange();
    expect(page.changeCardDialogOpen).toBeTrue();
    expect(page.error()).toBeTruthy();
    http.expectNone(`${environment.apiUrl}billing/checkout`);
  });

  it('submits once on double click and prevents another submission after an unresolved response', async () => {
    await loadDebt();
    const pending = page.pay();
    await page.pay();
    const request = http.expectOne(`${environment.apiUrl}billing/checkout`);
    expect(request.request.body).toEqual({ planId: 3, recoveryOnly: true, recoveryQuote: 'a'.repeat(64) });
    request.flush({ message: 'תשלום קודם בבירור' }, { status: 409, statusText: 'Conflict' });
    await pending;
    expect(page.error()).toBe('תשלום קודם בבירור');
    await page.pay();
    http.expectNone(`${environment.apiUrl}billing/checkout`);
  });
});
