import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { BillingStateService } from 'src/app/services/billing-state.service';
import { FeezbackService } from 'src/app/services/feezback.service';
import { OpenBankingEnrollmentService } from 'src/app/services/open-banking-enrollment.service';
import { OpenBankingPage } from './open-banking.page';

describe('OpenBankingPage', () => {
  let page: OpenBankingPage, enrollment: any, billing: any, feezback: any, router: any;
  const options = () => ({ plans: [{ id: 5, name: 'Banking', amountAgorot: 6372, quote: 'quote', currency: 'ILS' }],
    nonBankingPlans: [{ id: 4, name: 'Basic' }], trialEnd: '2099-11-07T07:14:48Z', status: 'TRIAL',
    hasSavedCard: false, complimentary: false, enrollment: null });
  beforeEach(async () => {
    enrollment = { options: jasmine.createSpy().and.resolveTo(options()), prepare: jasmine.createSpy().and.resolveTo(),
      cancel: jasmine.createSpy().and.resolveTo() };
    billing = { hasBillingOverride: jasmine.createSpy().and.returnValue(false), reloadBillingStateQuietly: jasmine.createSpy().and.resolveTo() };
    feezback = { connectionOptions: jasmine.createSpy().and.returnValue(of({ offerSpouse: false })), createConsentLink: jasmine.createSpy().and.returnValue(of(null)) };
    router = { navigate: jasmine.createSpy().and.resolveTo(true), navigateByUrl: jasmine.createSpy().and.resolveTo(true),
      getCurrentNavigation: () => ({ previousNavigation: { finalUrl: '/transactions?tab=bank' } }), serializeUrl: (url: string) => url };
    TestBed.configureTestingModule({ providers: [
      { provide: OpenBankingEnrollmentService, useValue: enrollment }, { provide: BillingStateService, useValue: billing },
      { provide: FeezbackService, useValue: feezback }, { provide: Router, useValue: router },
    ] });
    page = TestBed.runInInjectionContext(() => new OpenBankingPage());
    await page.ngOnInit();
  });
  for (const eligible of [{ status: 'ACTIVE', complimentary: false }, { status: 'TRIAL', complimentary: true }]) {
    it(`automatically connects on init for ${JSON.stringify(eligible)}`, async () => {
      enrollment.options.and.resolveTo({ ...options(), ...eligible });
      const redirect = spyOn<any>(page, 'redirectToFeezback').and.resolveTo();
      await page.ngOnInit();
      expect(redirect).toHaveBeenCalledOnceWith(false);
      expect(enrollment.prepare).not.toHaveBeenCalled();
      expect(page.cardDialog()).toBeFalse();
    });
  }
  it('preserves the spouse choice during automatic connection', async () => {
    enrollment.options.and.resolveTo({ ...options(), status: 'ACTIVE' });
    feezback.connectionOptions.and.returnValue(of({ offerSpouse: true }));
    await page.ngOnInit();
    expect(page.identityDialog()).toBeTrue();
    expect(feezback.createConsentLink).not.toHaveBeenCalled();
  });
  it('keeps automatic connection failures visible without exposing the provider body', async () => {
    enrollment.options.and.resolveTo({ ...options(), status: 'ACTIVE' });
    feezback.createConsentLink.and.returnValue(throwError(() => ({ status: 403, error: { message: 'secret provider URL/token' } })));
    await page.ngOnInit();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(page.error()).toContain('קישור מאובטח'); expect(page.error()).toContain('403');
    expect(page.error()).not.toContain('secret');
    expect(page.busy()).toBeFalse();
  });
  it('returns to the originating route on spouse dialog cancellation without creating a link', async () => {
    page.identityDialog.set(true);
    await page.cancelConnection();
    expect(page.identityDialog()).toBeFalse();
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/transactions?tab=bank', { replaceUrl: true });
    expect(feezback.createConsentLink).not.toHaveBeenCalled();
    expect(enrollment.cancel).not.toHaveBeenCalled();
  });
  it('retains an actionable options failure and can retry the active connection', async () => {
    enrollment.options.and.rejectWith(new Error('offline'));
    await page.load();
    expect(router.navigateByUrl).not.toHaveBeenCalled(); expect(page.options()).toBeNull();
    expect(page.error()).toContain('פרטי ההצטרפות'); expect(page.busy()).toBeFalse();
    enrollment.options.and.resolveTo({ ...options(), status: 'ACTIVE' });
    feezback.connectionOptions.and.returnValue(of({ offerSpouse: true }));
    await page.retryLoad(); expect(page.error()).toBe(''); expect(page.identityDialog()).toBeTrue();
  });
  it('returns to the origin when card collection is dismissed', async () => {
    page.onCardDialogChange(false);
    await Promise.resolve();
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/transactions?tab=bank', { replaceUrl: true });
  });
  it('does not treat a successful card save as cancellation', async () => {
    page.onCardDialogChange(false);
    await page.cardSaved();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
  it('requires an eligible plan before saving a card or leaving for Feezback', async () => {
    page.selectedPlanId = null; await page.continue(); expect(enrollment.prepare).not.toHaveBeenCalled();
    expect(feezback.createConsentLink).not.toHaveBeenCalled(); expect(page.cardDialog()).toBeFalse();
  });
  it('saves the chosen quote before opening token-only card collection', async () => {
    await page.continue();
    expect(enrollment.prepare).toHaveBeenCalledOnceWith(5, 'quote');
    expect(page.cardDialog()).toBeTrue(); expect(feezback.createConsentLink).not.toHaveBeenCalled();
  });
  it('does not enter Feezback merely because a replacement card was saved', async () => {
    await page.cardSaved(); expect(feezback.createConsentLink).not.toHaveBeenCalled();
  });
  it('opens existing card collection from the plan CTA and continues only after saved confirmation', async () => {
    const connect = spyOn<any>(page, 'connect').and.resolveTo();
    await page.choosePlan(5);
    expect(page.cardDialog()).toBeTrue();
    expect(enrollment.prepare).toHaveBeenCalledOnceWith(5, 'quote');
    expect(connect).not.toHaveBeenCalled();
    await page.cardSaved();
    expect(connect).toHaveBeenCalledTimes(1);
  });
  it('rejects represented-user enrollment', async () => {
    billing.hasBillingOverride.and.returnValue(true);
    await page.continue(); expect(enrollment.prepare).not.toHaveBeenCalled();
  });
  it('suppresses a concurrent prepare', async () => {
    let finish!: () => void;
    enrollment.prepare.and.returnValue(new Promise<void>(resolve => finish = resolve));
    const first = page.continue(); await page.continue();
    expect(enrollment.prepare).toHaveBeenCalledTimes(1); finish(); await first;
  });
  it('cancels the exact enrollment into a non-banking plan and refreshes billing', async () => {
    page.options.set({ ...options(), enrollment: { eventId: 42, planId: 5, status: 'READY', firstBillingAt: '2099-11-07' } });
    await page.cancel(); expect(enrollment.cancel).toHaveBeenCalledOnceWith(42, 4);
    expect(billing.reloadBillingStateQuietly).toHaveBeenCalled(); expect(router.navigate).toHaveBeenCalled();
  });
  it('keeps preparation failure visible and never opens CardCom', async () => {
    enrollment.prepare.and.rejectWith({ error: { message: 'quote changed' } });
    await page.continue(); expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(page.error()).toContain('לאשר את ההצטרפות'); expect(page.error()).not.toContain('quote changed');
    expect(page.cardDialog()).toBeFalse(); expect(feezback.createConsentLink).not.toHaveBeenCalled();
  });
  it('shows an unchecked choice before redirect for an existing or historical connection', async () => {
    feezback.connectionOptions.and.returnValue(of({ offerSpouse: true }));
    page.spouseConnection.set(true);
    await (page as any).connect();
    expect(page.identityDialog()).toBeTrue(); expect(page.spouseConnection()).toBeFalse();
    expect(feezback.createConsentLink).not.toHaveBeenCalled();
  });
  it('continues the first connection without showing the spouse choice', async () => {
    const redirect = spyOn<any>(page, 'redirectToFeezback').and.resolveTo();
    await (page as any).connect();
    expect(redirect).toHaveBeenCalledOnceWith(false); expect(page.identityDialog()).toBeFalse();
  });
  it('uses spouse only when checked and never sends anything on cancellation', async () => {
    const redirect = spyOn<any>(page, 'redirectToFeezback').and.resolveTo();
    page.identityDialog.set(true); page.spouseConnection.set(true);
    await page.confirmIdentity(); expect(redirect).toHaveBeenCalledWith(true);
    page.identityDialog.set(true); page.spouseConnection.set(false);
    await page.confirmIdentity(); expect(redirect).toHaveBeenCalledWith(false);
    redirect.calls.reset(); page.identityDialog.set(false);
    await page.confirmIdentity(); expect(redirect).not.toHaveBeenCalled();
  });
  it('never redirects when connection options fail', async () => {
    feezback.connectionOptions.and.throwError('offline');
    await expectAsync((page as any).connect()).toBeRejected();
    expect(feezback.createConsentLink).not.toHaveBeenCalled();
    expect(page.error()).toContain('אפשרויות החיבור');
  });
  it('keeps the selected identity and retry available on link failure and suppresses double submission', async () => {
    const redirect = spyOn<any>(page, 'redirectToFeezback').and.rejectWith(new Error('offline'));
    page.identityDialog.set(true); page.spouseConnection.set(true); await page.confirmIdentity();
    expect(page.identityDialog()).toBeTrue(); expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(page.spouseConnection()).toBeTrue(); expect(page.error()).toContain('קישור מאובטח');
    page.busy.set(true); await page.confirmIdentity(); expect(redirect).toHaveBeenCalledTimes(1);
    page.busy.set(false); redirect.and.resolveTo(); await page.confirmIdentity();
    expect(redirect).toHaveBeenCalledWith(true); expect(page.identityDialog()).toBeFalse(); expect(page.error()).toBe('');
  });
  it('keeps a connection-options failure visible after confirmed card save', async () => {
    await page.choosePlan(5);
    feezback.connectionOptions.and.returnValue(throwError(() => ({ status: 503, error: 'private response' })));
    page.onCardDialogChange(false); await page.cardSaved();
    expect(router.navigateByUrl).not.toHaveBeenCalled(); expect(page.error()).toContain('אפשרויות החיבור');
    expect(page.error()).toContain('503'); expect(page.error()).not.toContain('private'); expect(page.busy()).toBeFalse();
  });

});
