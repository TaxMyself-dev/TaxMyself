import { of } from 'rxjs';
import { FlowReportPage } from './flow-report.page';

/**
 * These specs drive the component class directly with stub collaborators
 * rather than through TestBed: `addTransToExpense()` is plain orchestration
 * over injected services, and instantiating the real page would pull in the
 * whole Ionic table template for no added coverage.
 */
describe('FlowReportPage — receipt upload business scoping', () => {
  let component: FlowReportPage;
  let fileService: { uploadFileViaFront: jasmine.Spy; deleteFileFromFirebase: jasmine.Spy };
  let genericService: {
    getLoader: jasmine.Spy;
    updateLoaderMessage: jasmine.Spy;
    dismissLoader: jasmine.Spy;
    showToast: jasmine.Spy;
    addComma: jasmine.Spy;
  };
  let flowReportService: { addTransToExpense: jasmine.Spy; getFlowReportData: jasmine.Spy };
  let router: { navigate: jasmine.Spy };

  const receipt = () => new File(['receipt'], 'receipt.png', { type: 'image/png' });

  beforeEach(() => {
    fileService = {
      uploadFileViaFront: jasmine.createSpy('uploadFileViaFront')
        .and.returnValue(of({ metadata: { fullPath: 'usersUploads/x/receipt.png' } })),
      deleteFileFromFirebase: jasmine.createSpy('deleteFileFromFirebase'),
    };
    genericService = {
      getLoader: jasmine.createSpy('getLoader').and.returnValue(of(null)),
      updateLoaderMessage: jasmine.createSpy('updateLoaderMessage'),
      dismissLoader: jasmine.createSpy('dismissLoader'),
      showToast: jasmine.createSpy('showToast'),
      addComma: jasmine.createSpy('addComma').and.callFake((n: number) => `${n}`),
    };
    flowReportService = {
      addTransToExpense: jasmine.createSpy('addTransToExpense').and.returnValue(of({})),
      getFlowReportData: jasmine.createSpy('getFlowReportData').and.returnValue(of([])),
    };
    router = { navigate: jasmine.createSpy('navigate') };

    component = new FlowReportPage(
      { getUserDataFromLocalStorage: () => ({ businessStatus: 'SINGLE_BUSINESS' }) } as any,
      genericService as any,
      fileService as any,
      { queryParams: of({}) } as any,
      flowReportService as any,
      router as any,
    );
  });

  it('uploads each receipt under the business number the report was opened for', () => {
    const file = receipt();
    component.businessNumber = '123456789';
    component.chosenTrans = [{ id: 7, file }];

    component.addTransToExpense();

    expect(fileService.uploadFileViaFront).toHaveBeenCalledTimes(1);
    expect(fileService.uploadFileViaFront).toHaveBeenCalledWith(file, '123456789');
    expect(flowReportService.addTransToExpense).toHaveBeenCalled();
  });

  it('aborts the upload when the business number is missing', () => {
    component.businessNumber = undefined;
    component.chosenTrans = [{ id: 7, file: receipt() }];

    component.addTransToExpense();

    expect(fileService.uploadFileViaFront).not.toHaveBeenCalled();
    expect(flowReportService.addTransToExpense).not.toHaveBeenCalled();
    expect(genericService.showToast).toHaveBeenCalledWith(jasmine.any(String), 'error');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('aborts the upload when the business number is blank', () => {
    component.businessNumber = '   ';
    component.chosenTrans = [{ id: 7, file: receipt() }];

    component.addTransToExpense();

    expect(fileService.uploadFileViaFront).not.toHaveBeenCalled();
    expect(flowReportService.addTransToExpense).not.toHaveBeenCalled();
    expect(genericService.showToast).toHaveBeenCalledWith(jasmine.any(String), 'error');
  });

  it('still commits transactions that carry no file, with no business number needed', () => {
    component.businessNumber = undefined;
    component.chosenTrans = [{ id: 7 }];

    component.addTransToExpense();

    expect(fileService.uploadFileViaFront).not.toHaveBeenCalled();
    expect(flowReportService.addTransToExpense).toHaveBeenCalled();
  });
});
