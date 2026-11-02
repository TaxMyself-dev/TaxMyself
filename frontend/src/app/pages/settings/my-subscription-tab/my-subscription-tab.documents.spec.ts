import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { FilesService } from 'src/app/services/files.service';
import { BillingStateService } from 'src/app/services/billing-state.service';
import { MySubscriptionTabComponent } from './my-subscription-tab.component';

describe('My Subscription document actions', () => {
  let page: MySubscriptionTabComponent;
  let billing: any, files: any, messages: any, preview: any;
  beforeEach(() => {
    billing = { billingState: signal(null), isLoading: signal(false), hasBillingOverride: signal(false),
      getReceiptBlob: jasmine.createSpy() };
    files = { previewFile3: jasmine.createSpy(), downloadFile: jasmine.createSpy() };
    messages = { add: jasmine.createSpy() };
    preview = { opener: {}, close: jasmine.createSpy() };
    TestBed.configureTestingModule({ providers: [
      { provide: BillingStateService, useValue: billing }, { provide: FilesService, useValue: files },
      { provide: Router, useValue: {} }, { provide: MessageService, useValue: messages },
    ] });
    page = TestBed.runInInjectionContext(() => new MySubscriptionTabComponent());
    spyOn(window, 'open').and.returnValue(preview);
  });
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  function click(name: string, row: any) { page.historyRowActions.find(a => a.name === name)!.action(null, row); }

  it('previews the authenticated document for both charge and negative refund rows, keeping download available', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    billing.getReceiptBlob.and.returnValue(Promise.resolve(blob));
    page.paymentHistory.set([
      { eventId: 10, amountAgorot: 5782, status: 'SUCCESS', receiptAvailable: true },
      { eventId: 93, amountAgorot: -3500, status: 'SUCCESS', receiptAvailable: true },
    ] as any);
    for (const row of page.historyRows()) {
      click('viewReceipt', row);
      expect(page.downloadingEventId()).toBe(Number(row['eventId']));
      await settle();
      expect(billing.getReceiptBlob).toHaveBeenCalledWith(row['eventId']);
      expect(files.previewFile3).toHaveBeenCalledWith(blob, preview);
      expect(preview.opener).toBeNull();
      expect(page.downloadingEventId()).toBeNull();
    }
    expect(files.downloadFile).not.toHaveBeenCalled();
    click('downloadReceipt', page.historyRows()[1]); await settle();
    expect(files.downloadFile).toHaveBeenCalledWith('קבלה-93.pdf', blob);
  });
  it('closes the reserved preview and shows a friendly error when the document is unavailable', async () => {
    billing.getReceiptBlob.and.returnValue(Promise.reject({ status: 404 }));
    click('viewReceipt', { eventId: 93 }); await settle();
    expect(preview.close).toHaveBeenCalled();
    expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ detail: 'לא קיים מסמך עבור תשלום זה' }));
    expect(files.previewFile3).not.toHaveBeenCalled();
    expect(page.downloadingEventId()).toBeNull();
  });
  it('suppresses repeated preview/download requests while a document read is in flight', async () => {
    let resolve!: (blob: Blob) => void;
    billing.getReceiptBlob.and.returnValue(new Promise<Blob>(done => resolve = done));
    click('viewReceipt', { eventId: 93 }); click('viewReceipt', { eventId: 93 });
    click('downloadReceipt', { eventId: 10 });
    expect(billing.getReceiptBlob).toHaveBeenCalledTimes(1); expect(window.open).toHaveBeenCalledTimes(1);
    resolve(new Blob()); await settle(); expect(page.downloadingEventId()).toBeNull();
  });
  it('explains popup blocking without fetching a document', () => {
    (window.open as jasmine.Spy).and.returnValue(null);
    click('viewReceipt', { eventId: 93 });
    expect(billing.getReceiptBlob).not.toHaveBeenCalled();
    expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'info' }));
  });
});
