import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { ModalExpensesComponent } from './modal.component';

/**
 * `getFileData()` is exercised on a directly-constructed component with stub
 * collaborators. Going through TestBed would require the whole Ionic form
 * template and the category/supplier service calls in ngOnInit, none of which
 * this behaviour depends on.
 */
describe('ModalExpensesComponent — receipt upload business scoping', () => {
  let component: ModalExpensesComponent;
  let fileService: { uploadFileViaFront: jasmine.Spy };
  let genericService: { showToast: jasmine.Spy };
  let activeBusinessNumber: string | null;

  const formBuilder = new FormBuilder();
  const receipt = () => new File(['receipt'], 'receipt.png', { type: 'image/png' });

  /** Builds just the control `resolveBusinessNumber()` reads. */
  const withFormBusinessNumber = (value: string) => {
    component.addExpenseForm = formBuilder.group({ businessNumber: [value] });
  };

  beforeEach(() => {
    activeBusinessNumber = null;
    fileService = {
      uploadFileViaFront: jasmine.createSpy('uploadFileViaFront')
        .and.returnValue(of({ metadata: { fullPath: 'usersUploads/x/receipt.png' } })),
    };
    genericService = { showToast: jasmine.createSpy('showToast') };

    component = new ModalExpensesComponent(
      fileService as any,
      formBuilder,
      {} as any,
      {} as any,
      {} as any,
      { bypassSecurityTrustResourceUrl: (v: string) => v } as any,
      { getActiveBusinessNumber: () => activeBusinessNumber } as any,
      genericService as any,
      {} as any,
      {} as any,
    );
    component.userData = { businessNumber: '' } as any;
    withFormBusinessNumber('');
  });

  it('uses the business picked in the form (MULTI_BUSINESS)', () => {
    const file = receipt();
    component.userData = { businessStatus: 'MULTI_BUSINESS', businessNumber: '111111111' } as any;
    withFormBusinessNumber('222222222');
    activeBusinessNumber = '999999999';
    component.fileToUpload = file;

    component.getFileData().subscribe();

    expect(fileService.uploadFileViaFront).toHaveBeenCalledWith(file, '222222222');
  });

  it('falls back to the active business when the form has no selection', () => {
    const file = receipt();
    activeBusinessNumber = '888888888';
    component.fileToUpload = file;

    component.getFileData().subscribe();

    expect(fileService.uploadFileViaFront).toHaveBeenCalledWith(file, '888888888');
  });

  it("falls back to the user's own business when there is no active business", () => {
    const file = receipt();
    component.userData = { businessStatus: 'SINGLE_BUSINESS', businessNumber: '777777777' } as any;
    component.fileToUpload = file;

    component.getFileData().subscribe();

    expect(fileService.uploadFileViaFront).toHaveBeenCalledWith(file, '777777777');
  });

  it('never falls back to a hardcoded business number', () => {
    component.fileToUpload = receipt();

    component.getFileData().subscribe();

    expect(fileService.uploadFileViaFront).not.toHaveBeenCalled();
  });

  it('aborts without uploading when no business number can be resolved', () => {
    const next = jasmine.createSpy('next');
    const complete = jasmine.createSpy('complete');
    component.fileToUpload = receipt();

    component.getFileData().subscribe({ next, complete });

    expect(fileService.uploadFileViaFront).not.toHaveBeenCalled();
    expect(genericService.showToast).toHaveBeenCalledWith(jasmine.any(String), 'error');
    expect(next).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalled();
  });

  it('treats a blank business number as missing', () => {
    withFormBusinessNumber('   ');
    component.fileToUpload = receipt();

    component.getFileData().subscribe();

    expect(fileService.uploadFileViaFront).not.toHaveBeenCalled();
    expect(genericService.showToast).toHaveBeenCalledWith(jasmine.any(String), 'error');
  });

  it('emits null and uploads nothing when no file was selected', () => {
    const next = jasmine.createSpy('next');
    component.fileToUpload = undefined;
    activeBusinessNumber = '888888888';

    component.getFileData().subscribe(next);

    expect(fileService.uploadFileViaFront).not.toHaveBeenCalled();
    expect(genericService.showToast).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(null);
  });
});
