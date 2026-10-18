import { computed, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { DocCreatePage } from './doc-create.page';
import { FilesService } from '../../services/files.service';
import { writePdfPreviewStatus } from '../../services/pdf-preview-tab';

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
