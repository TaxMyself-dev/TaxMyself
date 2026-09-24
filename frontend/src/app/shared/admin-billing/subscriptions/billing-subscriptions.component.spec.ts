import { Component, Input, NO_ERRORS_SCHEMA } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { InputTextComponent } from 'src/app/components/input-text/input-text.component';
import {
  AdminBillingService,
  AdminSubscription,
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
      'getSubscriptions',
      'getPlans',
      'getUnresolvedBillingAttempts',
      'triggerSubscriptionRenewal',
      'runDueRenewals',
      'updateSubscriptionPlan',
      'updateSubscriptionTrialEnd',
      'updateSubscriptionDiscount',
    ]);
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
    // No resolve/retry/charge controls anywhere in the section.
    expect(section.querySelectorAll('button, a, input').length).toBe(0);
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
});
