import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { BillingStateService } from '../../services/billing-state.service';
import { FilesService } from '../../services/files.service';
import { SettingsNewSubscriptionComponent } from './settings-new-subscription.component';

describe('new subscription presentation preserves billing rules', () => {
  let page: SettingsNewSubscriptionComponent;
  let state: any;
  beforeEach(() => {
    state = { billingState: signal({ subscription: { status: 'ACTIVE', billingAccessMode: 'STANDARD' }, paymentMethod: { brand: 'Mastercard', last4: '1234' } }),
      isLoading: signal(false), hasBillingOverride: signal(false) };
    TestBed.configureTestingModule({ providers: [
      { provide: BillingStateService, useValue: state }, { provide: FilesService, useValue: {} },
      { provide: Router, useValue: {} }, { provide: MessageService, useValue: { add: jasmine.createSpy() } },
    ] });
    page = TestBed.runInInjectionContext(() => new SettingsNewSubscriptionComponent());
  });
  it('opens the existing payment dialog only for an eligible owner', () => {
    page.changePaymentMethod();
    expect(page.changePmDialogOpen()).toBeTrue();
    page.changePmDialogOpen.set(false);
    state.hasBillingOverride.set(true);
    page.changePaymentMethod();
    expect(page.changePmDialogOpen()).toBeFalse();
  });
  it('does not open payment replacement for complimentary access or a trial', () => {
    state.billingState.set({ subscription: { status: 'ACTIVE', billingAccessMode: 'COMPLIMENTARY_FULL' } });
    page.changePaymentMethod();
    expect(page.changePmDialogOpen()).toBeFalse();
    state.billingState.set({ subscription: { status: 'TRIAL', billingAccessMode: 'STANDARD' } });
    page.changePaymentMethod();
    expect(page.changePmDialogOpen()).toBeFalse();
  });
  it('uses the real brand and never labels an unknown card as Mastercard', () => {
    expect(page.isMastercard()).toBeTrue();
    state.billingState.update((value: any) => ({ ...value, paymentMethod: { brand: 'Visa' } }));
    expect(page.isMastercard()).toBeFalse();
  });
  it('retains receipt actions and requires explicit confirmation for cancellation', async () => {
    expect(page.historyRowActions.map(action => action.name)).toContain('downloadReceipt');
    expect(page.historyRowActions.map(action => action.name)).toContain('viewReceipt');
    state.cancelSubscription = jasmine.createSpy('cancel').and.resolveTo();
    await page.confirmCancellation();
    expect(state.cancelSubscription).not.toHaveBeenCalled();
  });
});
