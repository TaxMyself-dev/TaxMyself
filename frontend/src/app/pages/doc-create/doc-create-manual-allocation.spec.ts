import { computed, signal } from '@angular/core';
import { of } from 'rxjs';
import { DocCreatePage } from './doc-create.page';

describe('manual allocation from document creation', () => {
  function setup(): any {
    const page = Object.create(DocCreatePage.prototype) as any;
    page.showAllocationDecisionDialog = signal(true);
    page.createPDFIsLoading = signal(false);
    page.createPreviewPDFIsLoading = signal(false);
    page.allocationNumberLoading = signal(false);
    page.documentRequestBusy = computed(
      () => page.createPDFIsLoading() || page.createPreviewPDFIsLoading() || page.allocationNumberLoading(),
    );
    page.selectedBusinessNumber = '';
    page.buildDocPayload = jasmine.createSpy().and.returnValue({
      docData: {
        issuerBusinessNumber: '515151515',
        docType: 'TAX_INVOICE',
        docDate: '2026-11-19',
        recipientId: '123456789',
        sumAftDisBefVAT: 6001,
        vatSum: 1080.18,
      },
    });
    page.docCreateService = {
      createDoc: jasmine.createSpy().and.returnValue(of({ docNumber: '30005' })),
    };
    page.messageService = { add: jasmine.createSpy() };
    page.resetDocFormsAndDrafts = jasmine.createSpy();
    page.router = { navigate: jasmine.createSpy() };
    return page;
  }

  it('persists a pending document and opens the populated manual flow', () => {
    const page = setup();

    page.onCreateWithManualAllocation();

    expect(page.showAllocationDecisionDialog()).toBeFalse();
    expect(page.docCreateService.createDoc).toHaveBeenCalledWith(
      jasmine.objectContaining({
        docData: jasmine.objectContaining({
          docStatus: 'PENDING_ALLOCATION',
          allocationNum: null,
        }),
      }),
    );
    expect(page.router.navigate).toHaveBeenCalledWith(
      ['/book-keeping/incomes'],
      {
        state: {
          autoOpenAllocationFor: jasmine.objectContaining({
            issuerBusinessNumber: '515151515',
            docNumber: '30005',
            recipientId: '123456789',
          }),
        },
      },
    );
  });
});
