import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { FilesService } from 'src/app/services/files.service';
import { BillingStateService } from 'src/app/services/billing-state.service';
import { DateFormatPipe } from 'src/app/pipes/date-format.pipe';
import { MySubscriptionTabComponent } from './my-subscription-tab.component';

describe('My Subscription payment-history dates', () => {
  it('passes raw dates through so the shared table and mobile card format them once', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: BillingStateService, useValue: { billingState: signal(null), isLoading: signal(false), hasBillingOverride: signal(false) } },
      { provide: FilesService, useValue: {} }, { provide: Router, useValue: {} },
      { provide: MessageService, useValue: { add: () => undefined } },
    ] });
    const page = TestBed.runInInjectionContext(() => new MySubscriptionTabComponent());
    const dates = ['2026-10-01', '2026-03-04', '2026-08-31'];
    page.paymentHistory.set(dates.map((date, i) => ({ eventId: `e${i}`, date, status: 'SUCCESS' } as any)));
    const pipe = new DateFormatPipe();
    expect(page.historyRows().map(r => pipe.transform(r['date'] as string)))
      .toEqual(['01/10/2026', '04/03/2026', '31/08/2026']);
  });
});
