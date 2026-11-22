import { signal } from '@angular/core';
import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { DocCreatePage } from './doc-create.page';

describe('SHAAM connection loading feedback', () => {
  function setup(connectionResult: any): any {
    const page = Object.create(DocCreatePage.prototype) as any;
    page.selectedBusinessNumber = '515151515';
    page.allocationFlowLoading = signal(false);
    page.allocationConnectionCheckLoading = signal(false);
    page.shaamService = {
      getConnectionStatus: jasmine.createSpy().and.returnValue(connectionResult),
    };
    page.messageService = { add: jasmine.createSpy() };
    page.showShaamConnectionRequiredDialog = jasmine.createSpy();
    page.showShaamConnectionError = jasmine.createSpy();
    page.createPendingAllocationDoc = jasmine.createSpy();
    return page;
  }

  it('shows checking immediately and keeps loading while issuance starts', fakeAsync(() => {
    const connection = new Subject<any>();
    const page = setup(connection);

    page.openShaamDialog();

    expect(page.allocationFlowLoading()).toBeTrue();
    expect(page.allocationConnectionCheckLoading()).toBeTrue();

    connection.next({ connected: true });
    flushMicrotasks();

    expect(page.allocationConnectionCheckLoading()).toBeFalse();
    expect(page.allocationFlowLoading()).toBeTrue();
    expect(page.createPendingAllocationDoc).toHaveBeenCalledOnceWith({
      requestAllocation: true,
    });
  }));

  it('closes loading before showing the disconnected state', fakeAsync(() => {
    const page = setup(of({ connected: false }));

    page.openShaamDialog();
    flushMicrotasks();

    expect(page.allocationConnectionCheckLoading()).toBeFalse();
    expect(page.allocationFlowLoading()).toBeFalse();
    expect(page.showShaamConnectionRequiredDialog).toHaveBeenCalled();
  }));
});
