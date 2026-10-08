import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
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
    feezback = { createConsentLink: jasmine.createSpy().and.returnValue(of(null)) };
    router = { navigate: jasmine.createSpy().and.resolveTo(true) };
    TestBed.configureTestingModule({ providers: [
      { provide: OpenBankingEnrollmentService, useValue: enrollment }, { provide: BillingStateService, useValue: billing },
      { provide: FeezbackService, useValue: feezback }, { provide: Router, useValue: router },
    ] });
    page = TestBed.runInInjectionContext(() => new OpenBankingPage());
    await page.ngOnInit();
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
  it('keeps the user on the page when preparing fails and never opens CardCom', async () => {
    enrollment.prepare.and.rejectWith({ error: { message: 'quote changed' } });
    await page.continue(); expect(page.error()).toBe('quote changed');
    expect(page.cardDialog()).toBeFalse(); expect(feezback.createConsentLink).not.toHaveBeenCalled();
  });
});
