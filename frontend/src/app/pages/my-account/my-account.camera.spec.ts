import { ElementRef } from '@angular/core';
import { MyAccountPage } from './my-account.page';

describe('Home camera action', () => {
  let page: MyAccountPage;
  let input: HTMLInputElement;
  let click: jasmine.Spy;

  beforeEach(() => {
    // Exercise the camera boundary without initializing dashboard polling/services.
    page = Object.create(MyAccountPage.prototype);
    input = document.createElement('input');
    input.type = 'file';
    click = spyOn(input, 'click');
    Object.assign(page, {
      isMobile: () => true,
      expenseCameraInput: new ElementRef(input),
      canUploadToDrive: () => true,
    });
  });

  it('opens the native camera picker synchronously on mobile', () => {
    page.openExpenseCamera();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('does not open the camera on desktop', () => {
    Object.assign(page, { isMobile: () => false });
    page.openExpenseCamera();
    expect(click).not.toHaveBeenCalled();
  });

  it('does not open the camera when upload access is denied', () => {
    Object.assign(page, { canUploadToDrive: () => false });
    page.openExpenseCamera();
    expect(click).not.toHaveBeenCalled();
  });

  it('does not upload when camera capture is cancelled', () => {
    const open = spyOn(page, 'openQuickUploadToDrive');
    page.onExpensePhotoCaptured({ target: input } as unknown as Event);
    expect(open).not.toHaveBeenCalled();
  });

  it('passes the confirmed photo to the upload flow and resets the picker', () => {
    const file = new File(['photo'], 'receipt.jpg', { type: 'image/jpeg' });
    const picker = { files: [file], value: 'receipt.jpg' };
    const open = spyOn(page, 'openQuickUploadToDrive');
    page.onExpensePhotoCaptured({ target: picker } as unknown as Event);
    expect(open).toHaveBeenCalledOnceWith(file);
    expect(picker.value).toBe('');
  });
});
