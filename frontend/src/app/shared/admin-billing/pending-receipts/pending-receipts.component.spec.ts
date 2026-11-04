import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminBillingService } from 'src/app/services/admin-billing.service';
import { PendingReceiptsComponent } from './pending-receipts.component';

describe('PendingReceiptsComponent existing invoice email', () => {
  let component: PendingReceiptsComponent;
  let api: any;
  let confirmation: any;
  let messages: any;
  beforeEach(() => {
    api = { getPendingReceiptFailures: jasmine.createSpy().and.returnValue(of([])),
      resendReceiptEmail: jasmine.createSpy().and.returnValue(of({ sent: true })),
      generateReceiptForEvent: jasmine.createSpy() };
    confirmation = { confirm: jasmine.createSpy() };
    messages = { add: jasmine.createSpy() };
    TestBed.configureTestingModule({ imports: [PendingReceiptsComponent], providers: [
      { provide: AdminBillingService, useValue: api },
      { provide: ConfirmationService, useValue: confirmation },
      { provide: MessageService, useValue: messages },
    ] }).overrideComponent(PendingReceiptsComponent, { set: { template: '', imports: [] } });
    component = TestBed.createComponent(PendingReceiptsComponent).componentInstance;
  });
  it('offers resend for an existing renewal invoice and generation only for missing documents', () => {
    const resend = component.rowActions.find(a => a.name === 'resendEmail')!;
    const generate = component.rowActions.find(a => a.name === 'generate')!;
    expect(resend.showWhen!({ receiptDocId: 243 })).toBeTrue();
    expect(generate.showWhen!({ receiptDocId: 243 })).toBeFalse();
    expect(resend.showWhen!({ receiptDocId: null })).toBeFalse();
    expect(generate.showWhen!({ receiptDocId: null })).toBeTrue();
  });
  it('sends only after confirmation, using the event id and no generation call', () => {
    component.confirmResend({ billingEventId: 108, receiptDocId: 243 });
    expect(api.resendReceiptEmail).not.toHaveBeenCalled();
    confirmation.confirm.calls.mostRecent().args[0].accept();
    expect(api.resendReceiptEmail).toHaveBeenCalledWith(108);
    expect(api.generateReceiptForEvent).not.toHaveBeenCalled();
    expect(api.getPendingReceiptFailures).toHaveBeenCalled();
  });
  it('reports failed delivery without claiming success', () => {
    api.resendReceiptEmail.and.returnValue(of({ sent: false }));
    component.confirmResend({ billingEventId: 108, receiptDocId: 243 });
    confirmation.confirm.calls.mostRecent().args[0].accept();
    expect(messages.add.calls.mostRecent().args[0].severity).toBe('warn');
  });
});
