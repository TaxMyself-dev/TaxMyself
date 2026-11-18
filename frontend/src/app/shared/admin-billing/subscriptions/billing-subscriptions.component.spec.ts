import { Component, Input, NO_ERRORS_SCHEMA } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, Subject, throwError } from 'rxjs';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { InputTextComponent } from 'src/app/components/input-text/input-text.component';
import {
  AdminBillingService,
  AdminSubscription,
  AdminSubscriptionPricing,
  AdminUnresolvedBillingAttempt,
} from 'src/app/services/admin-billing.service';
import { BillingSubscriptionsComponent } from './billing-subscriptions.component';

/** Renders only the cell templates, so the real status cell (and its indicator) is exercised. */
@Component({
  selector: 'app-generic-table',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    @for (row of dataTable; track row['subscriptionId']) {
    <div class="stub-row">
      @for (col of columnsTitle; track col.name) { @if (col.cellTemplate) {
      <ng-container *ngTemplateOutlet="col.cellTemplate; context: { $implicit: row, row: row }"></ng-container>
      } }
    </div>
    }
  `,
})
class GenericTableStubComponent {
  @Input() columnsTitle: any[] = [];
  @Input() dataTable: any[] = [];
}

const subscription = (id: number, overrides: Partial<AdminSubscription> = {}): AdminSubscription => ({
  subscriptionId: id,
  firebaseId: `client-${id}`,
  billingAccessMode: 'STANDARD',
  status: 'ACTIVE',
  userId: id,
  userName: `לקוח ${id}`,
  userEmail: null,
  hasOpenBanking: false,
  lastLoginAt: null,
  businessId: null,
  businessName: null,
  planId: null,
  planName: null,
  planSlug: null,
  planPriceAgorot: 11700,
  nextBillingAmountAgorot: null,
  trialEnd: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  nextBillingDate: null,
  gracePeriodEndsAt: null,
  canceledAt: null,
  endedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  cardTokenExists: false,
  cardLast4: null,
  cardBrand: null,
  cardExpiryMonth: null,
  cardExpiryYear: null,
  discountPercent: null,
  discountAmountAgorot: null,
  discountStartDate: null,
  discountEndDate: null,
  unresolvedBillingAttemptCount: 0,
  mostSevereUnresolvedAttemptStatus: null,
  ...overrides,
});

const attempt = (
  attemptId: number,
  overrides: Partial<AdminUnresolvedBillingAttempt> = {},
): AdminUnresolvedBillingAttempt => ({
  attemptId,
  stateVersion: 0,
  status: 'MANUAL_REVIEW',
  chargeMode: 'TOKEN_TRANSACTION',
  amountAgorot: 11700,
  currency: 'ILS',
  createdAt: '2026-09-01T08:00:00.000Z',
  capturedAt: null,
  unknownSince: '2026-09-01T08:05:00.000Z',
  reconciliationAttempts: 5,
  lastReconciledAt: '2026-09-02T08:05:00.000Z',
  nextActionAt: null,
  providerResponseCode: null,
  providerDescription: null,
  failureCategory: 'RECONCILIATION_EXHAUSTED',
  requiredAction: 'INTERNAL_REVIEW',
  cardcomTransactionId: null,
  cardcomLowProfileId: null,
  cardTokenRecovered: false,
  ...overrides,
});

describe('BillingSubscriptionsComponent billing exceptions', () => {
  let api: jasmine.SpyObj<AdminBillingService>;
  let fixture: ComponentFixture<BillingSubscriptionsComponent>;
  let component: BillingSubscriptionsComponent;

  const render = async (subscriptions: AdminSubscription[], attempts: unknown[] = []) => {
    api.getSubscriptions.and.returnValue(of(subscriptions));
    api.getPlans.and.returnValue(of([]));
    api.getUnresolvedBillingAttempts.and.returnValue(of(attempts as AdminUnresolvedBillingAttempt[]));
    fixture = TestBed.createComponent(BillingSubscriptionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges(); // the status column template resolves after the first view pass
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj<AdminBillingService>('AdminBillingService', [
      'getSubscriptionPricing',
      'updateSubscriptionPricing',
      'getSubscriptions',
      'getPlans',
      'getUnresolvedBillingAttempts',
      'resolveBillingAttempt',
      'triggerSubscriptionRenewal',
      'runDueRenewals',
      'updateSubscriptionPlan',
      'updateSubscriptionTrialEnd',
      'updateSubscriptionDiscount',
    ]);
    api.getSubscriptionPricing.and.callFake(id => of(pricingContext(id)));
    await TestBed.configureTestingModule({
      imports: [BillingSubscriptionsComponent, NoopAnimationsModule],
      providers: [{ provide: AdminBillingService, useValue: api }, MessageService, ConfirmationService],
    })
      .overrideComponent(BillingSubscriptionsComponent, {
        remove: {
          imports: [
            GenericTableComponent,
            ButtonComponent,
            InputTextComponent,
            InputDateComponent,
            InputSelectComponent,
          ],
        },
        add: { imports: [GenericTableStubComponent], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();
  });

  it('shows the warning indicator only for subscriptions with unresolved attempts', async () => {
    await render([
      subscription(1, { unresolvedBillingAttemptCount: 2, mostSevereUnresolvedAttemptStatus: 'MANUAL_REVIEW' }),
      subscription(2),
    ]);

    const rows: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.stub-row'));
    expect(rows.length).toBe(2);
    const flag = rows[0].querySelector('.billing-exception-flag');
    expect(flag).not.toBeNull();
    expect(flag!.getAttribute('aria-label')).toContain('2 ניסיונות חיוב לא סגורים');
    expect(flag!.getAttribute('aria-label')).toContain('נדרשת בדיקה ידנית');
    expect(rows[1].querySelector('.billing-exception-flag')).toBeNull();
  });

  it('filters the table by active, trial, and expired-trial status', async () => {
    await render([
      subscription(1, { status: 'ACTIVE' }),
      subscription(2, { status: 'TRIAL' }),
      subscription(3, { status: 'TRIAL_EXPIRED' }),
      subscription(4, { status: 'CANCELED' }),
      subscription(5, { status: 'TRIAL_EXPIRED', billingAccessMode: 'COMPLIMENTARY_FULL' }),
    ]);

    expect(component.tableRows().map(row => row['subscriptionId'])).toEqual([1, 2, 3, 4, 5]);

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('[aria-label="סינון מנויים לפי סטטוס"]');
    select.value = 'TRIAL';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.tableRows().map(row => row['subscriptionId'])).toEqual([2]);

    select.value = 'TRIAL_EXPIRED';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.tableRows().map(row => row['subscriptionId'])).toEqual([3]);

    select.value = 'ACTIVE';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.tableRows().map(row => row['subscriptionId'])).toEqual([1]);
  });

  it('lazily loads and renders UNKNOWN / MANUAL_REVIEW details in Hebrew, read-only', async () => {
    await render(
      [subscription(7)],
      [
        attempt(12, {
          failureCategory: 'TOKEN_DECRYPTION_FAILED',
          cardcomTransactionId: 'TX-12',
          cardcomLowProfileId: 'LP-12',
          cardTokenRecovered: true,
          capturedAt: '2026-09-01T08:03:00.000Z',
        }),
        attempt(10, {
          failureCategory: 'MISSING_OR_EXPIRED_PAYMENT_METHOD',
          requiredAction: 'CUSTOMER_PAYMENT_METHOD',
        }),
        attempt(9, {
          status: 'UNKNOWN',
          chargeMode: 'LOW_PROFILE_HOSTED',
          failureCategory: 'PROVIDER_OUTCOME_UNKNOWN',
          requiredAction: 'AUTOMATIC_CHECK',
          reconciliationAttempts: 2,
          nextActionAt: '2026-09-03T10:30:00.000Z',
        }),
      ],
    );
    expect(api.getUnresolvedBillingAttempts).not.toHaveBeenCalled(); // nothing loaded until the drawer opens

    component.openEdit(7);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.getUnresolvedBillingAttempts).toHaveBeenCalledOnceWith(7);
    const section: HTMLElement = document.querySelector('[data-testid="billing-exceptions"]')!;
    const cards = Array.from(section.querySelectorAll('[data-testid="billing-exception"]')) as HTMLElement[];
    expect(cards.map((c) => c.querySelector('.exception-card-id')!.textContent!.trim())).toEqual([
      'ניסיון #12',
      'ניסיון #10',
      'ניסיון #9',
    ]); // API order (newest first) is preserved
    const text = section.textContent!.replace(/\s+/g, ' ');
    for (const expected of [
      'נדרשת בדיקה ידנית',
      'תוצאת החיוב עדיין בבירור',
      'חידוש בכרטיס שמור',
      'Hosted Checkout',
      '₪117.00',
      'TX-12',
      'LP-12',
      'כשל בפענוח אמצעי התשלום השמור',
      'אמצעי תשלום חסר או שפג תוקפו',
      'תוצאת החיוב אצל הספק עדיין נבדקת',
      'נדרשת פעולת לקוח: עדכון אמצעי תשלום.',
      'בדיקה פנימית של המערכת',
      'לא מתוכננת',
    ]) {
      expect(text).toContain(expected);
    }
    expect(cards[0].textContent).toMatch(/כרטיס שוחזר\s*כן/);
    expect(cards[1].textContent).toMatch(/כרטיס שוחזר\s*לא/);
    expect(section.textContent).toContain('בדיקת מצב מול קארדקום');
    expect(section.textContent).toContain('השלמת תשלום שנגבה');
    expect(api.triggerSubscriptionRenewal).not.toHaveBeenCalled();
  });

  it('shows closed attempts as history without unresolved problem text or actions', async () => {
    await render([subscription(7)], ['COMPLETED', 'CANCELED', 'DECLINED', 'EXPIRED'].map((status, index) =>
      attempt(index + 1, { status: status as any, lastResolution: {
        action: 'COMPLETE_CAPTURED', evidence: 'תיעוד בדיקה קודמת', actorFirebaseId: 'admin',
        createdAt: '2026-10-06T10:00:00Z',
      } })));
    component.openEdit(7);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const cards: HTMLElement[] = Array.from(document.body.querySelectorAll('[data-testid="billing-exception"]'));
    expect(cards.length).toBe(4);
    expect(cards[0].textContent).toContain('התשלום הושלם והחובות נסגרו');
    for (const card of cards) {
      expect(card.querySelector('.exception-action')).toBeNull();
      expect(card.querySelector('button, textarea, input')).toBeNull();
      expect(card.textContent).not.toContain('תוצאת החיוב אצל הספק עדיין נבדקת');
      expect(card.textContent).not.toContain('בדיקה הבאה');
      expect((card.querySelector('details') as HTMLDetailsElement).open).toBeFalse();
    }
  });

  it('requires documented evidence before attempting resolution', async () => {
    await render([subscription(7)], [attempt(10)]);
    component.openEdit(7);
    component.resolveAttempt(attempt(10), 'CHECK_PROVIDER');
    expect(api.resolveBillingAttempt).not.toHaveBeenCalled();
  });

  it('checks the existing attempt with its state version and reloads status', async () => {
    await render([subscription(7)], [attempt(10, { stateVersion: 4 })]);
    component.openEdit(7);
    component.resolutionEvidence[10] = 'בדיקה לפי אסמכתה בקארדקום';
    api.resolveBillingAttempt.and.returnValue(of({ status: 'UNKNOWN', completion: null }));
    component.resolveAttempt(attempt(10, { stateVersion: 4 }), 'CHECK_PROVIDER');
    expect(api.resolveBillingAttempt).toHaveBeenCalledWith(7, 10, jasmine.objectContaining({
      action: 'CHECK_PROVIDER', expectedStateVersion: 4, evidence: 'בדיקה לפי אסמכתה בקארדקום',
    }));
    expect(api.triggerSubscriptionRenewal).not.toHaveBeenCalled();
  });

  it('never renders sensitive or raw provider data, even if the API response carried it', async () => {
    const leaky = {
      ...attempt(5, {
        status: 'UNKNOWN',
        failureCategory: 'PROVIDER_OUTCOME_UNKNOWN',
        requiredAction: 'AUTOMATIC_CHECK',
      }),
      cardcomToken: 'tok-SECRET-1',
      encryptedToken: 'enc-SECRET-2',
      cardNumber: '4580000011112222',
      rawResponse: '{"ResponseCode":"SECRET-3"}',
      errorMessage: 'ECONNRESET SECRET-4',
      cardcomExternalUniqTranId: 'EXT-SECRET-5',
    };
    await render([subscription(7)], [leaky]);

    component.openEdit(7);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rendered = document.body.textContent!;
    expect(rendered).toContain('ניסיון #5');
    expect(rendered).not.toMatch(/SECRET|4580000011112222|ECONNRESET|ResponseCode/);
  });
  const pricingContext = (id = 7): AdminSubscriptionPricing => ({
    subscriptionId: id, planId: null, pricePolicy: 'LIVE', frozenPlanId: null,
    frozenMonthlyPriceAgorot: null, customMonthlyPriceAgorot: null,
    customPriceStartDate: null, customPriceEndDate: null, nextBillingDate: null,
    current: { source: 'PLAN', baseAmountAgorot: 10000, amountBeforeVatAgorot: 10000,
      amountIncludingVatAgorot: 11800, vatAmountAgorot: 1800, vatRate: 18 }, next: null,
  });

  it('accepts a zero personal price and clears its expiry when permanent is selected', async () => {
    await render([subscription(7)]);
    component.openEdit(7);
    component.editForm.patchValue({ customPriceEnabled: true, customPriceShekels: 0,
      customPriceTemporary: false, customPriceEndDate: '2026-12-31' });
    expect(component.pricingPayload()).toEqual({ pricePolicy: 'LIVE', customMonthlyPriceAgorot: 0,
      customPriceStartDate: null, customPriceEndDate: null });
  });

  it('rejects missing personal amount, missing temporary end and reversed dates', async () => {
    await render([subscription(7)]);
    component.openEdit(7);
    component.editForm.patchValue({ customPriceEnabled: true, customPriceShekels: null });
    expect(component.pricingPayload()).toBeNull();
    component.editForm.patchValue({ customPriceShekels: 79, customPriceTemporary: true });
    expect(component.pricingPayload()).toBeNull();
    component.editForm.patchValue({ customPriceStartDate: '2026-12-20', customPriceEndDate: '2026-12-10' });
    expect(component.pricingPayload()).toBeNull();
    component.editForm.patchValue({ customPriceEndDate: '2026-12-20' });
    expect(component.pricingPayload()?.customMonthlyPriceAgorot).toBe(7900);
  });

  it('blocks all ordinary writes if authoritative pricing failed to load', async () => {
    await render([subscription(7)]);
    api.getSubscriptionPricing.and.returnValue(throwError(() => new Error('offline')));
    component.openEdit(7);
    component.saveEdit();
    expect(component.pricingFailed()).toBeTrue();
    expect(api.updateSubscriptionPlan).not.toHaveBeenCalled();
    expect(api.updateSubscriptionPricing).not.toHaveBeenCalled();
  });

  it('saves pricing only after plan, trial and discount writes finish', async () => {
    await render([subscription(7)]);
    component.openEdit(7);
    component.editForm.patchValue({ planId: 3, customPriceEnabled: true, customPriceShekels: 79 });
    const planSaved = new Subject<any>();
    api.updateSubscriptionPlan.and.returnValue(planSaved);
    api.updateSubscriptionTrialEnd.and.returnValue(of({} as any));
    api.updateSubscriptionDiscount.and.returnValue(of({} as any));
    api.updateSubscriptionPricing.and.returnValue(of(pricingContext()));
    component.saveEdit();
    expect(api.updateSubscriptionPricing).not.toHaveBeenCalled();
    planSaved.next({}); planSaved.complete();
    expect(api.updateSubscriptionPricing).toHaveBeenCalledWith(7, {
      pricePolicy: 'LIVE', customMonthlyPriceAgorot: 7900, customPriceStartDate: null, customPriceEndDate: null,
    });
  });

  it('cancels stale pricing requests when switching or closing the drawer', async () => {
    await render([subscription(7), subscription(8)]);
    const old = new Subject<AdminSubscriptionPricing>();
    api.getSubscriptionPricing.and.returnValue(old);
    component.openEdit(7);
    api.getSubscriptionPricing.and.returnValue(of(pricingContext(8)));
    component.openEdit(8);
    old.next({ ...pricingContext(7), customMonthlyPriceAgorot: 1 });
    expect(component.pricing()?.subscriptionId).toBe(8);
    component.onDrawerHide();
    expect(component.pricing()).toBeNull();
  });

  it('closes stale drawer state and reports partial writes when the pricing save fails', async () => {
    await render([subscription(7)]);
    component.openEdit(7);
    component.editForm.patchValue({ customPriceEnabled: true, customPriceShekels: 79 });
    api.updateSubscriptionPlan.and.returnValue(of({} as any));
    api.updateSubscriptionTrialEnd.and.returnValue(of({} as any));
    api.updateSubscriptionDiscount.and.returnValue(of({} as any));
    api.updateSubscriptionPricing.and.returnValue(throwError(() => new Error('offline')));
    const toast = spyOn(TestBed.inject(MessageService), 'add');
    component.saveEdit();
    expect(component.showDrawer()).toBeFalse();
    expect(component.selectedSub()).toBeNull();
    expect(toast).toHaveBeenCalledWith(jasmine.objectContaining({ detail: jasmine.stringMatching('ייתכן שחלק מהשינויים נשמרו') }));
  });

});
