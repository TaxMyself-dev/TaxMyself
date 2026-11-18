import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BillingPlansPage } from './billing-plans.page';
import { BillingStateService } from '../../services/billing-state.service';
import { GenericService } from '../../services/generic.service';
import { environment } from 'src/environments/environment';
import { provideRouter, Router } from '@angular/router';

describe('BillingPlansPage plan changes', () => {
  let page: BillingPlansPage, http: HttpTestingController, state: any, toast: jasmine.Spy;
  const quote = () => ({ action: 'UPGRADE', targetPlanId: 2, finalAmountAgorot: 1770,
    amountBeforeVatAgorot: 1500, vatAmountAgorot: 270, renewalAmountAgorot: 9440,
    effectiveAt: new Date().toISOString(), nextBillingDate: '2099-10-07T09:00:00Z', quotedAt: new Date().toISOString(),
    planChangeQuote: 'a'.repeat(64), expiresAt: new Date(Date.now() + 600_000).toISOString() });
  beforeEach(() => {
    state = { billingState: signal({ subscription: { status: 'ACTIVE' }, plan: { id: 1 }, pendingPlanChange: null }),
      effectiveStatus: () => state.billingState()?.subscription?.status ?? null, hasBillingOverride: () => false,
      loadBillingState: jasmine.createSpy().and.resolveTo(), refreshBillingState: jasmine.createSpy().and.resolveTo() };
    toast = jasmine.createSpy();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: BillingStateService, useValue: state }, { provide: GenericService, useValue: { showToast: toast } }] });
    http = TestBed.inject(HttpTestingController);
    page = TestBed.runInInjectionContext(() => new BillingPlansPage());
  });
  afterEach(() => http.verify());

  it('redirects a server-owned pending checkout without loading or creating another payment', async () => {
    state.billingState.set({ subscription: { status: 'TRIAL_EXPIRED' }, plan: null,
      pendingPlanChange: null, pendingCheckout: { status: 'PENDING', flow: 'PLANS' } });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);

    page.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();

    expect(router.navigate).toHaveBeenCalledWith(['/billing/payment-status'], { replaceUrl: true });
    http.expectNone(`${environment.apiUrl}billing/plans`);
    http.expectNone(`${environment.apiUrl}billing/checkout`);
  });

  it('loads a preview without starting payment until confirmation', async () => {
    const request = page.checkout(2);
    http.expectNone(`${environment.apiUrl}billing/checkout`);
    http.expectOne(`${environment.apiUrl}billing/checkout/preview`).flush(quote());
    await request;
    expect(page.amountNowLabel()).toBe('17.70');
    expect(page.nextAmountLabel()).toBe('94.40');
    expect(page.planChangePreview()?.action).toBe('UPGRADE');
  });
  it('schedules a reviewed downgrade without redirecting or collecting another payment', async () => {
    const preview = { ...quote(), action: 'DOWNGRADE' as const, finalAmountAgorot: 0 };
    page.planChangePreview.set(preview);
    const operation = page.confirmPlanChange();
    await page.confirmPlanChange();
    const request = http.expectOne(`${environment.apiUrl}billing/checkout`);
    expect(request.request.body).toEqual({ planId: 2, planChangeQuote: preview.planChangeQuote, planChangeQuotedAt: preview.quotedAt });
    request.flush({ status: 'SCHEDULED', effectiveAt: preview.nextBillingDate });
    await operation;
    expect(state.refreshBillingState).toHaveBeenCalledTimes(1);
    expect(page.planChangePreview()).toBeNull();
    expect(toast).toHaveBeenCalledWith('השנמוך נקבע לחידוש הבא. לא בוצע חיוב כעת.', 'success');
  });
  it('rejects an expired quote without submitting a payment', async () => {
    page.planChangePreview.set({ ...quote(), action: 'UPGRADE', expiresAt: new Date(Date.now() - 1000).toISOString() } as any);
    await page.confirmPlanChange();
    http.expectNone(`${environment.apiUrl}billing/checkout`);
    expect(page.planChangePreview()).toBeNull();
  });
  it('clears the quote after an uncertain submission, preventing immediate resubmission', async () => {
    page.planChangePreview.set(quote() as any);
    const operation = page.confirmPlanChange();
    http.expectOne(`${environment.apiUrl}billing/checkout`).flush({ message: 'התשלום בבירור' }, { status: 409, statusText: 'Conflict' });
    await operation;
    await page.confirmPlanChange();
    http.expectNone(`${environment.apiUrl}billing/checkout`);
    expect(toast).toHaveBeenCalledWith('התשלום בבירור', 'error');
  });
  it('does not select the current plan or let impersonated access change plans', async () => {
    await page.checkout(1);
    expect(page.planChangePreview()).toBeNull();
    http.expectNone(`${environment.apiUrl}billing/checkout/preview`);
    state.hasBillingOverride = () => true;
    await page.checkout(2);
    page.planChangePreview.set(quote() as any);
    await page.confirmPlanChange();
    http.expectNone(`${environment.apiUrl}billing/checkout/preview`);
    http.expectNone(`${environment.apiUrl}billing/checkout`);
  });
  it('cancels exactly the displayed pending request and refreshes state', async () => {
    state.billingState.set({ subscription: { status: 'ACTIVE' }, plan: { id: 1 },
      pendingPlanChange: { eventId: 19, planId: 2 } });
    const operation = page.cancelPendingChange();
    const request = http.expectOne(`${environment.apiUrl}billing/plan-change/cancel`);
    expect(request.request.body).toEqual({ expectedEventId: 19 });
    request.flush({ status: 'CANCELED' });
    await operation;
    expect(state.refreshBillingState).toHaveBeenCalledTimes(1);
  });
  it('does not open a plan change while subscription cancellation is scheduled', async () => {
    state.billingState.update((value: any) => ({ ...value, pendingCancellation: { eventId: 61 } }));
    await page.checkout(2);
    page.planChangePreview.set(quote() as any);
    await page.confirmPlanChange();
    http.expectNone(`${environment.apiUrl}billing/checkout/preview`);
    http.expectNone(`${environment.apiUrl}billing/checkout`);
    expect(state.refreshBillingState).not.toHaveBeenCalled();
  });

  it('shows a visible error when initial checkout is rejected', async () => {
    state.billingState.set({ subscription: { status: 'TRIAL_EXPIRED' }, plan: null, pendingPlanChange: null });
    const operation = page.checkout(2);
    http.expectOne(`${environment.apiUrl}billing/checkout`).flush(
      { message: 'לא ניתן להמשיך כרגע את עמוד התשלום הקיים.' },
      { status: 409, statusText: 'Conflict' },
    );
    await operation;

    expect(page.feedback()).toEqual({ kind: 'error', text: 'לא ניתן להמשיך כרגע את עמוד התשלום הקיים.' });
    expect(page.checkingOutPlanId()).toBeNull();
  });

  it('shows processing state without opening another payment page', async () => {
    state.billingState.set({ subscription: { status: 'TRIAL_EXPIRED' }, plan: null, pendingPlanChange: null });
    const operation = page.checkout(2);
    http.expectOne(`${environment.apiUrl}billing/checkout`).flush({ status: 'PROCESSING' });
    await operation;

    expect(page.feedback()?.kind).toBe('info');
    expect(page.feedback()?.text).toContain('התשלום התקבל');
    expect(page.checkingOutPlanId()).toBeNull();
    expect(state.refreshBillingState).toHaveBeenCalledTimes(1);
  });
  it('refreshes a zero-price initial activation without redirecting to an undefined URL', async () => {
    state.effectiveStatus = () => 'TRIAL';
    const beforeUrl = window.location.href;
    sessionStorage.setItem('tm.checkoutLowProfileId', 'old-checkout');
    const operation = page.checkout(2);
    http.expectOne(`${environment.apiUrl}billing/checkout`).flush({ status: 'APPLIED', nextBillingDate: '2026-12-05' });
    await operation;
    expect(state.refreshBillingState).toHaveBeenCalledTimes(1);
    expect(page.checkingOutPlanId()).toBeNull();
    expect(sessionStorage.getItem('tm.checkoutLowProfileId')).toBeNull();
    expect(window.location.href).toBe(beforeUrl);
    expect(toast).toHaveBeenCalledWith('התוכנית הופעלה ללא חיוב.', 'success');
  });
  it('rejects an invalid initial checkout response without navigation', async () => {
    state.effectiveStatus = () => 'TRIAL';
    const beforeUrl = window.location.href;
    const operation = page.checkout(2);
    http.expectOne(`${environment.apiUrl}billing/checkout`).flush({});
    await operation;
    expect(page.checkingOutPlanId()).toBeNull();
    expect(window.location.href).toBe(beforeUrl);
    expect(toast).toHaveBeenCalledWith('לא התקבל עמוד תשלום תקין. יש לנסות שוב.', 'error');
  });

});
