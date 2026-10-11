import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { of, Subject, throwError } from 'rxjs';
import { DriveDocsService } from 'src/app/services/drive-docs.service';
import { GenericService } from 'src/app/services/generic.service';
import { QuickUploadDriveDialogComponent } from './quick-upload-drive-dialog.component';

describe('QuickUploadDriveDialogComponent camera upload', () => {
  const photo = () => new File(['photo'], 'receipt.jpg', { type: 'image/jpeg' });
  let upload: jasmine.Spy;
  let close: jasmine.Spy;
  let message: jasmine.Spy;

  function create(file?: File, businesses = [{ label: 'Business', value: '123' }]) {
    upload = jasmine.createSpy('upload').and.returnValue(of([{ fileId: '1', fileName: 'receipt.jpg' }]));
    close = jasmine.createSpy('close');
    message = jasmine.createSpy('add');
    TestBed.configureTestingModule({ providers: [
      { provide: DynamicDialogConfig, useValue: { data: { capturedFile: file } } },
      { provide: DynamicDialogRef, useValue: { close } },
      { provide: DriveDocsService, useValue: { uploadFilesToInbox: upload } },
      { provide: MessageService, useValue: { add: message } },
      { provide: GenericService, useValue: { businessSelectItems: signal(businesses) } },
    ] });
    return TestBed.runInInjectionContext(() => new QuickUploadDriveDialogComponent());
  }

  it('uploads a captured photo automatically to the only business', () => {
    const file = photo();
    const dialog = create(file);
    dialog.ngOnInit();
    expect(upload).toHaveBeenCalledOnceWith([file], '123', undefined);
    expect(close).toHaveBeenCalledWith({ uploaded: 1 });
    expect(dialog.isUploading()).toBeFalse();
  });

  it('requires explicit business selection when there are multiple businesses', () => {
    const file = photo();
    const dialog = create(file, [{ label: 'One', value: '123' }, { label: 'Two', value: '456' }]);
    dialog.ngOnInit();
    expect(upload).not.toHaveBeenCalled();
    expect(dialog.selectedFiles()).toEqual([file]);
    dialog.onBusinessSelected('456');
    dialog.upload();
    expect(upload).toHaveBeenCalledOnceWith([file], '456', undefined);
  });

  it('does not automatically upload in the ordinary file-picker flow', () => {
    const dialog = create();
    dialog.ngOnInit();
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects unsupported photos before making a request', () => {
    const dialog = create(new File(['photo'], 'receipt.heic', { type: 'image/heic' }));
    dialog.ngOnInit();
    expect(upload).not.toHaveBeenCalled();
    expect(message).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'warn' }));
    expect(close).toHaveBeenCalled();
  });

  it('rejects photos over the existing 10MB limit', () => {
    const dialog = create(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }));
    dialog.ngOnInit();
    expect(upload).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('keeps the photo available for retry after a failed upload', () => {
    const file = photo();
    const dialog = create(file);
    upload.and.returnValue(throwError(() => ({ error: { message: 'Failed' } })));
    dialog.ngOnInit();
    expect(close).not.toHaveBeenCalled();
    expect(dialog.canUpload()).toBeTrue();
    upload.and.returnValue(of([{ fileId: '1', fileName: file.name }]));
    dialog.upload();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledWith({ uploaded: 1 });
  });

  it('prevents duplicate submissions while the photo is uploading', () => {
    const dialog = create(photo());
    const pending = new Subject<{ fileId: string; fileName: string }[]>();
    upload.and.returnValue(pending);
    dialog.ngOnInit();
    dialog.upload();
    dialog.cancel();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    pending.next([{ fileId: '1', fileName: 'receipt.jpg' }]);
    pending.complete();
    expect(dialog.isUploading()).toBeFalse();
  });
});
