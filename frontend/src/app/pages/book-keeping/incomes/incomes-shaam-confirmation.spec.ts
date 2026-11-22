import { IncomesPage } from './incomes.page';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

describe('pending allocation completion choice', () => {
  function setup() {
    const page = Object.create(IncomesPage.prototype) as any;
    (page as any).confirmationService = { confirm: jasmine.createSpy('confirm') };
    (page as any).messageService = { add: jasmine.createSpy('add') };
    page.pendingFinalizeRow = signal(null);
    page.showAllocationMethodDialog = signal(false);
    page.showAllocationInputDialog = signal(false);
    page.manualAllocationDetailsLoading = signal(false);
    page.manualAllocationDetailsError = signal(false);
    page.manualAllocationItemDescription = signal('');
    page.allocationInputValue = '';
    page.selectedBusinessNumber = () => '123456789';
    page.documentsService = {
      getDocLines: jasmine.createSpy().and.returnValue(of([
        { description: 'שירותי ייעוץ' },
        { description: 'ליווי מקצועי' },
      ])),
    };
    (page as any).resumeAutomaticAllocation = jasmine.createSpy('resumeAutomaticAllocation');
    return page;
  }

  it('opens one method dialog without contacting SHAAM', () => {
    const page = setup();
    const row = { docNumber: '30199' } as any;

    page.openAllocationMethodDialog(row);

    expect((page as any).resumeAutomaticAllocation).not.toHaveBeenCalled();
    expect(page.pendingFinalizeRow()).toBe(row);
    expect(page.showAllocationMethodDialog()).toBeTrue();
  });

  it('does not open the method dialog without a document number', () => {
    const page = setup();

    page.openAllocationMethodDialog({});

    expect(page.showAllocationMethodDialog()).toBeFalse();
    expect((page as any).resumeAutomaticAllocation).not.toHaveBeenCalled();
    expect((page as any).messageService.add).toHaveBeenCalledWith(
      jasmine.objectContaining({ severity: 'error' }),
    );
  });

  it('uses the automatic flow when the business is connected', () => {
    const page = setup();
    const row = { issuerBusinessNumber: '123456789', docNumber: '30199' } as any;
    page.shaamService = {
      getConnectionStatus: jasmine.createSpy().and.returnValue(of({ connected: true })),
    };
    page.pendingFinalizeRow.set(row);
    page.showAllocationMethodDialog.set(true);

    page.chooseAutomaticAllocation();

    expect(page.showAllocationMethodDialog()).toBeFalse();
    expect(page.resumeAutomaticAllocation).toHaveBeenCalledOnceWith(row);
  });

  it('offers the existing connection screen when no connection exists', () => {
    const page = setup();
    page.router = { navigate: jasmine.createSpy('navigate') };
    page.shaamService = {
      getConnectionStatus: jasmine.createSpy().and.returnValue(of({ connected: false })),
    };
    page.pendingFinalizeRow.set({ issuerBusinessNumber: '123456789', docNumber: '30199' });

    page.chooseAutomaticAllocation();

    const dialog = page.confirmationService.confirm.calls.mostRecent().args[0];
    expect(dialog.acceptLabel).toBe('מעבר לחיבור');
    dialog.accept();
    expect(page.router.navigate).toHaveBeenCalledWith(
      ['/settings'],
      { queryParams: { tab: 'permissions' } },
    );
    expect(page.resumeAutomaticAllocation).not.toHaveBeenCalled();
  });

  it('opens the existing document-details dialog for manual allocation', () => {
    const page = setup();
    const row = { issuerBusinessNumber: '123456789', docNumber: '30199' };
    page.pendingFinalizeRow.set(row);
    page.showAllocationMethodDialog.set(true);

    page.chooseManualAllocation();

    // PrimeNG emits onHide for the method dialog after it is hidden by the
    // selection handler. This must not clear the row now owned by the manual
    // allocation dialog.
    page.cancelAllocationMethodDialog();

    expect(page.showAllocationMethodDialog()).toBeFalse();
    expect(page.showAllocationInputDialog()).toBeTrue();
    expect(page.pendingFinalizeRow()).toBe(row);
    expect(page.documentsService.getDocLines).toHaveBeenCalledOnceWith('123456789', '30199');
    expect(page.manualAllocationItemDescription()).toBe('שירותי ייעוץ | ליווי מקצועי');
  });

  it('clears the selected row when the method dialog is explicitly dismissed', () => {
    const page = setup();
    page.pendingFinalizeRow.set({ docNumber: '30199' });
    page.showAllocationMethodDialog.set(true);

    page.cancelAllocationMethodDialog();

    expect(page.showAllocationMethodDialog()).toBeFalse();
    expect(page.pendingFinalizeRow()).toBeNull();
  });

  it('keeps the manual dialog usable when loading line descriptions fails', () => {
    const page = setup();
    page.documentsService.getDocLines.and.returnValue(
      throwError(() => new Error('lines unavailable')),
    );
    const row = {
      issuerBusinessNumber: '123456789',
      docNumber: '30199',
      docDescription: 'תיאור כללי',
    };

    page.getAllocationFromTaxAuthority(row);

    expect(page.showAllocationInputDialog()).toBeTrue();
    expect(page.manualAllocationDetailsLoading()).toBeFalse();
    expect(page.manualAllocationDetailsError()).toBeTrue();
    expect(page.manualAllocationItemDescription()).toBe('תיאור כללי');
  });

  it('does not submit Approval when the durable status is unknown', () => {
    const page = Object.create(IncomesPage.prototype) as any;
    page.messageService = { add: jasmine.createSpy('add') };
    page.selectedBusinessNumber = () => '123456789';
    page.resolveDocType = () => 'TAX_INVOICE';
    page.gs = { getLoader: () => of(null), updateLoaderMessage: () => undefined, dismissLoader: () => undefined };
    page.shaamService = {
      getInvoiceAllocationStatus: jasmine.createSpy().and.returnValue(of({
        state: 'UNKNOWN_OUTCOME', canRequest: false, canFinalizeLocally: false,
        requiresAdminResolution: true, requestId: 'request-id', updatedAt: null,
      })),
      requestInvoiceAllocation: jasmine.createSpy(),
    };

    page.resumeAutomaticAllocation({ issuerBusinessNumber: '123456789', docNumber: '20000' });

    expect(page.shaamService.requestInvoiceAllocation).not.toHaveBeenCalled();
    expect(page.messageService.add).toHaveBeenCalledWith(
      jasmine.objectContaining({ severity: 'error' }),
    );
  });
});
