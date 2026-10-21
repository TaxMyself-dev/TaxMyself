import { computed, signal } from '@angular/core';
import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import {
  canRequestAllocationVoluntarilyFor,
  DocCreatePage,
  normalizeRestoredPayments,
  requiresAllocationNumberFor,
} from './doc-create.page';
import { FilesService } from '../../services/files.service';
import { writePdfPreviewStatus } from '../../services/pdf-preview-tab';
import { DocumentType } from './doc-cerate.enum';
import { SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED } from '../../services/shaam.service';

describe('document preview and create request coordination', () => {
  let page: any, request: Subject<Blob>, tab: any;
  beforeEach(() => {
    page = Object.create(DocCreatePage.prototype);
    page.createPDFIsLoading = signal(false);
    page.createPreviewPDFIsLoading = signal(false);
    page.allocationNumberLoading = signal(false);
    page.documentRequestBusy = computed(() => page.createPDFIsLoading() || page.createPreviewPDFIsLoading() || page.allocationNumberLoading());
    page.allocationNumber = signal(null);
    page.pdfPreviewBlob = signal(null); page.pdfPreviewVisible = signal(false);
    page.showCreateDocErrorDialog = signal(false);
    page.usesInAppPdfPreview = () => false;
    page.requiresAllocationNumber = () => false;
    page.buildDocPayload = jasmine.createSpy().and.returnValue({docData: {}});
    page.messageService = {add: jasmine.createSpy()};
    request = new Subject<Blob>();
    page.docCreateService = {previewDoc: jasmine.createSpy().and.returnValue(request), createDoc: jasmine.createSpy().and.returnValue(request)};
    page.fileService = {previewFile3: jasmine.createSpy()};
    tab = {closed: false, document: {open: jasmine.createSpy(), write: jasmine.createSpy(), close: jasmine.createSpy()}};
    spyOn(window, 'open').and.returnValue(tab);
  });
  it('writes loading before the response and prevents duplicate/cross-action requests', () => {
    page.previewDoc();
    expect(tab.document.write.calls.mostRecent().args[0]).toContain('מכינים את התצוגה המקדימה');
    expect(page.documentRequestBusy()).toBeTrue();
    page.previewDoc(); page.createDoc(); page.proceedWithDocumentCreation();
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(page.docCreateService.previewDoc).toHaveBeenCalledTimes(1);
    expect(page.docCreateService.createDoc).not.toHaveBeenCalled();
    const blob = new Blob(['pdf']); request.next(blob); request.complete();
    expect(page.fileService.previewFile3).toHaveBeenCalledWith(blob, tab);
    expect(page.documentRequestBusy()).toBeFalse();
  });
  it('blocks preview while creation is pending, and releases after creation error', () => {
    page.proceedWithDocumentCreation();
    page.proceedWithDocumentCreation(); page.previewDoc();
    expect(page.docCreateService.createDoc).toHaveBeenCalledTimes(1);
    expect(window.open).not.toHaveBeenCalled();
    request.error(new Error('failure'));
    expect(page.documentRequestBusy()).toBeFalse();
  });
  it('shows a static error in the tab and restores temporary allocation on failure', () => {
    page.requiresAllocationNumber = () => true;
    page.previewDoc();
    request.error(new Error('private upstream details'));
    const html = tab.document.write.calls.mostRecent().args[0];
    expect(html).toContain('לא הצלחנו להכין');
    expect(html).not.toContain('private');
    expect(page.allocationNumber()).toBeNull();
    expect(page.documentRequestBusy()).toBeFalse();
  });
  it('releases both actions when payload construction throws', () => {
    page.buildDocPayload.and.throwError('invalid');
    page.previewDoc(); expect(page.documentRequestBusy()).toBeFalse();
    page.proceedWithDocumentCreation(); expect(page.documentRequestBusy()).toBeFalse();
    expect(page.docCreateService.createDoc).not.toHaveBeenCalled();
  });
  it('falls back to in-app preview if the browser blocks the new tab', () => {
    (window.open as jasmine.Spy).and.returnValue(null);
    page.previewDoc(); const blob = new Blob(['pdf']); request.next(blob); request.complete();
    expect(page.pdfPreviewVisible()).toBeTrue();
    expect(page.pdfPreviewBlob()).toBe(blob);
    expect(page.documentRequestBusy()).toBeFalse();
  });
  it('keeps mobile preview in app and safely handles a tab closed by the user', () => {
    page.usesInAppPdfPreview = () => true;
    page.previewDoc(); request.next(new Blob()); request.complete();
    expect(window.open).not.toHaveBeenCalled();
    expect(page.pdfPreviewVisible()).toBeTrue();
    tab.closed = true; writePdfPreviewStatus(tab);
    expect(tab.document.write).not.toHaveBeenCalled();
  });
  it('replaces the loading document with PDF content and revokes its URL on navigation', () => {
    const files = Object.create(FilesService.prototype);
    tab.addEventListener = jasmine.createSpy();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test-preview');
    spyOn(URL, 'revokeObjectURL');
    writePdfPreviewStatus(tab);
    files.previewFile3(new Blob(), tab);
    expect(tab.document.open).toHaveBeenCalledTimes(2);
    expect(tab.document.write.calls.mostRecent().args[0]).toContain('iframe src="blob:test-preview"');
    const callback = tab.addEventListener.calls.mostRecent().args[1];
    callback(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-preview');
  });
  it('revokes the PDF URL if writing into a navigated tab fails', () => {
    const files = Object.create(FilesService.prototype);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test-preview');
    spyOn(URL, 'revokeObjectURL');
    tab.document.open.and.throwError('tab navigated');
    expect(() => files.previewFile3(new Blob(), tab)).toThrow();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-preview');
  });

  it('releases creation after success and keeps normal success handling', () => {
    page.dialogService = {open: jasmine.createSpy().and.returnValue({})};
    page.getHebrewNameDoc = () => 'קבלה';
    page.resetDocFormsAndDrafts = jasmine.createSpy();
    page.proceedWithDocumentCreation();
    request.next({success: true, docNumber: '10', docType: 'RECEIPT'} as any);
    request.complete();
    expect(page.resetDocFormsAndDrafts).toHaveBeenCalled();
    expect(page.showCreateDocErrorDialog()).toBeFalse();
    expect(page.documentRequestBusy()).toBeFalse();
  });
  it('blocks both actions during persisted allocation finalization', () => {
    page.allocationNumberLoading.set(true);
    page.previewDoc(); page.createDoc(); page.createPendingAllocationDoc({requestAllocation: false});
    expect(window.open).not.toHaveBeenCalled();
    expect(page.docCreateService.createDoc).not.toHaveBeenCalled();
  });

});

describe('voluntary SHAAM allocation', () => {
  const docDate = '2026-10-19';

  it('keeps 4,999 and exactly 5,000 optional, and 5,000.01 mandatory', () => {
    expect(requiresAllocationNumberFor(DocumentType.TAX_INVOICE, 4999, docDate)).toBeFalse();
    expect(requiresAllocationNumberFor(DocumentType.TAX_INVOICE, 5000, docDate)).toBeFalse();
    expect(requiresAllocationNumberFor(DocumentType.TAX_INVOICE, 5000.01, docDate)).toBeTrue();

    expect(canRequestAllocationVoluntarilyFor(DocumentType.TAX_INVOICE, 4999, docDate, false)).toBeTrue();
    expect(canRequestAllocationVoluntarilyFor(DocumentType.TAX_INVOICE_RECEIPT, 5000, docDate, false)).toBeTrue();
    expect(canRequestAllocationVoluntarilyFor(DocumentType.TAX_INVOICE, 5000.01, docDate, false)).toBeFalse();
  });

  it('hides the voluntary option for other documents and invoices that already have an allocation', () => {
    expect(canRequestAllocationVoluntarilyFor(DocumentType.RECEIPT, 4999, docDate, false)).toBeFalse();
    expect(canRequestAllocationVoluntarilyFor(DocumentType.TRANSACTION_INVOICE, 4999, docDate, false)).toBeFalse();
    expect(canRequestAllocationVoluntarilyFor(DocumentType.TAX_INVOICE, 4999, docDate, true)).toBeFalse();
  });

  function createConfirmationPage(options: {
    required?: boolean;
    voluntary?: boolean;
    recipientId?: string;
  } = {}): any {
    const page = Object.create(DocCreatePage.prototype);
    page.documentRequestBusy = () => false;
    page.requiresAllocationNumber = () => options.required ?? false;
    page.requestAllocationVoluntarily = signal(options.voluntary ?? false);
    page.shouldRequestAllocation = () => page.requiresAllocationNumber() || page.requestAllocationVoluntarily();
    page.allocationNumber = signal(null);
    const userDetailsForm = {
      get: () => ({value: options.recipientId ?? '515151515'}),
    };
    page.myForm = {get: () => userDetailsForm};
    page.confirmationService = {confirm: jasmine.createSpy()};
    page.showDocumentCreationConfirmation = jasmine.createSpy();
    page.showAllocationNumberDialog = jasmine.createSpy();
    page.showVoluntaryAllocationConfirmation = jasmine.createSpy();
    return page;
  }

  it('issues normally when the voluntary option is unchecked', () => {
    const page = createConfirmationPage();
    page.confirmCreateDoc();
    expect(page.showDocumentCreationConfirmation).toHaveBeenCalled();
    expect(page.showVoluntaryAllocationConfirmation).not.toHaveBeenCalled();
  });

  it('enters the voluntary allocation confirmation when selected', () => {
    const page = createConfirmationPage({voluntary: true});
    page.confirmCreateDoc();
    expect(page.showVoluntaryAllocationConfirmation).toHaveBeenCalled();
    expect(page.showAllocationNumberDialog).not.toHaveBeenCalled();
  });

  it('blocks a voluntary request without the recipient business number', () => {
    const page = createConfirmationPage({voluntary: true, recipientId: ' '});
    page.confirmCreateDoc();
    const confirmation = page.confirmationService.confirm.calls.mostRecent().args[0];
    expect(confirmation.message).toContain('כדי לבקש מספר הקצאה');
    expect(confirmation.message).not.toContain('לא יוכל לקזז');
    expect(page.showVoluntaryAllocationConfirmation).not.toHaveBeenCalled();
  });

  it('preserves the mandatory decision dialog above the threshold', () => {
    const page = createConfirmationPage({required: true});
    page.confirmCreateDoc();
    expect(page.showAllocationNumberDialog).toHaveBeenCalled();
    expect(page.showVoluntaryAllocationConfirmation).not.toHaveBeenCalled();
  });

  it('explains that the request is voluntary and proceeds through the SHAAM path on acceptance', () => {
    const page = Object.create(DocCreatePage.prototype) as any;
    page.confirmationService = {confirm: jasmine.createSpy()};
    page.openShaamDialog = jasmine.createSpy();
    page.showVoluntaryAllocationConfirmation();

    const confirmation = page.confirmationService.confirm.calls.mostRecent().args[0];
    expect(confirmation.message).toContain('וולונטרית');
    expect(confirmation.message).toContain('אינו מחייב מספר הקצאה');
    expect(confirmation.message).not.toContain('לא יוכל לקזז');
    confirmation.accept();
    expect(page.openShaamDialog).toHaveBeenCalled();
  });

  it('persists a pending invoice before requesting its allocation', () => {
    const page = Object.create(DocCreatePage.prototype) as any;
    const payload: any = {
      docData: {
        issuerBusinessNumber: '123456789',
        docType: DocumentType.TAX_INVOICE,
      },
    };
    page.documentRequestBusy = () => false;
    page.createPDFIsLoading = signal(false);
    page.buildDocPayload = jasmine.createSpy().and.returnValue(payload);
    page.docCreateService = {
      createDoc: jasmine.createSpy().and.returnValue(of({docNumber: '20001'})),
    };
    page.messageService = {add: jasmine.createSpy()};
    page.selectedBusinessNumber = '';
    page.fileSelected = () => DocumentType.TAX_INVOICE;
    page.requestAllocationForPersistedDocument = jasmine.createSpy();

    page.createPendingAllocationDoc({requestAllocation: true});

    expect(page.docCreateService.createDoc).toHaveBeenCalledWith(payload);
    expect(payload.docData.docStatus).toBe('PENDING_ALLOCATION');
    expect(payload.docData.allocationNum).toBeNull();
    expect(page.requestAllocationForPersistedDocument).toHaveBeenCalledWith(
      '123456789',
      '20001',
      DocumentType.TAX_INVOICE,
    );
  });

  it('does not repeat an Approval request after an unknown outcome', () => {
    const page = Object.create(DocCreatePage.prototype) as any;
    page.allocationNumberLoading = signal(false);
    page.shaamService = {
      requestInvoiceAllocation: jasmine.createSpy().and.returnValue(
        throwError(() => ({status: 409, error: {code: 'ALLOCATION_OUTCOME_UNKNOWN'}})),
      ),
    };
    page.messageService = {add: jasmine.createSpy()};
    page.resetDocFormsAndDrafts = jasmine.createSpy();
    page.router = {navigate: jasmine.createSpy()};

    page.requestAllocationForPersistedDocument('123456789', '20001', DocumentType.TAX_INVOICE);

    expect(page.shaamService.requestInvoiceAllocation).toHaveBeenCalledTimes(1);
    expect(page.messageService.add.calls.mostRecent().args[0].detail).toContain('אין לבקש מספר נוסף');
    expect(page.router.navigate).toHaveBeenCalledWith(['/book-keeping/incomes']);
    expect(page.allocationNumberLoading()).toBeFalse();
  });
});

describe('draft payment restoration after SHAAM OAuth', () => {
  it('maps the stored payment amount into the frontend payment shape', () => {
    const [payment] = normalizeRestoredPayments([{
      paymentMethod: 'BANK_TRANSFER',
      paymentAmount: '1000.0000',
      paymentLineNumber: '7',
      paymentDate: '2026-10-19',
      hebrewBankName: 'לאומי',
      bankNumber: '10',
    }]);

    expect(payment.paymentSum).toBe(1000);
    expect(payment.paymentLineNumber).toBe(1);
    expect(payment.paymentDate).toEqual(new Date('2026-10-19'));
    expect(payment.paymentAmount).toBeUndefined();
  });

  it('supports frontend-shaped data and restores missing line numbers sequentially', () => {
    const payments = normalizeRestoredPayments([
      { paymentMethod: 'CASH', paymentSum: 400, paymentDate: '2026-10-19' },
      { paymentMethod: 'CASH', paymentSum: 600, paymentDate: '2026-10-19' },
    ]);

    expect(payments.map(payment => payment.paymentSum)).toEqual([400, 600]);
    expect(payments.map(payment => payment.paymentLineNumber)).toEqual([1, 2]);
    expect(payments.reduce((total, payment) => total + Number(payment.paymentSum), 0)).toBe(1000);
  });

  it('recalculates the payment total when restoring the draft', () => {
    const page = Object.create(DocCreatePage.prototype) as any;
    page.editingPaymentIndex = signal(3);
    page.paymentsDraft = signal([]);
    page.totalPayments = signal(0);

    page.restorePayments([
      { paymentMethod: 'CASH', paymentAmount: '400.0000', paymentLineNumber: '1' },
      { paymentMethod: 'CASH', paymentAmount: '600.0000', paymentLineNumber: '2' },
    ]);

    expect(page.editingPaymentIndex()).toBeNull();
    expect(page.totalPayments()).toBe(1000);
    expect(page.paymentsDraft().map(payment => payment.paymentSum)).toEqual([400, 600]);
  });
});

describe('SHAAM connection pre-flight', () => {
  function createPage(connectionResult: any): any {
    const page = Object.create(DocCreatePage.prototype);
    page.selectedBusinessNumber = '777777715';
    page.shaamService = {
      getConnectionStatus: jasmine.createSpy().and.returnValue(connectionResult),
    };
    page.messageService = { add: jasmine.createSpy() };
    page.showShaamConnectionRequiredDialog = jasmine.createSpy();
    page.createPendingAllocationDoc = jasmine.createSpy();
    return page;
  }

  it('continues without OAuth when the existing connection is usable', fakeAsync(() => {
    const page = createPage(of({ connected: true, expiresAt: null }));

    page.openShaamDialog();
    flushMicrotasks();

    expect(page.createPendingAllocationDoc).toHaveBeenCalledWith({
      requestAllocation: true,
    });
    expect(page.showShaamConnectionRequiredDialog).not.toHaveBeenCalled();
  }));

  it('offers authorization when the backend explicitly reports no connection', fakeAsync(() => {
    const page = createPage(of({ connected: false, expiresAt: null }));

    page.openShaamDialog();
    flushMicrotasks();

    expect(page.showShaamConnectionRequiredDialog).toHaveBeenCalled();
    expect(page.createPendingAllocationDoc).not.toHaveBeenCalled();
  }));

  it('does not open OAuth after a transient refresh failure', fakeAsync(() => {
    const page = createPage(
      throwError(() => ({ status: 503, error: { message: 'upstream detail' } })),
    );

    page.openShaamDialog();
    flushMicrotasks();

    expect(page.showShaamConnectionRequiredDialog).not.toHaveBeenCalled();
    expect(page.createPendingAllocationDoc).not.toHaveBeenCalled();
    const message = page.messageService.add.calls.mostRecent().args[0];
    expect(message.detail).toContain('לא נפתחה בקשת הרשאה חדשה');
    expect(message.detail).not.toContain('upstream');
  }));

  it('shows a dedicated message for a blocked tsandbox business', fakeAsync(() => {
    const page = createPage(
      throwError(() => ({
        status: 400,
        error: { code: SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED },
      })),
    );

    page.openShaamDialog();
    flushMicrotasks();

    expect(page.showShaamConnectionRequiredDialog).not.toHaveBeenCalled();
    expect(page.messageService.add.calls.mostRecent().args[0].detail).toContain(
      'עסק הדמו',
    );
  }));
});
