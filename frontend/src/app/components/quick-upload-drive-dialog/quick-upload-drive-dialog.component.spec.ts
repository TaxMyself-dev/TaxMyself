import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { of, Subject, throwError } from 'rxjs';
import { DriveDocsService } from 'src/app/services/drive-docs.service';
import { GenericService } from 'src/app/services/generic.service';
import { environment } from 'src/environments/environment';
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
    expect(upload).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    pending.next([{ fileId: '1', fileName: 'receipt.jpg' }]);
    pending.complete();
    expect(dialog.isUploading()).toBeFalse();
  });

  it('cancels the active upload and ignores any later result', () => {
    const dialog = create(photo());
    const pending = new Subject<{ fileId: string; fileName: string }[]>();
    upload.and.returnValue(pending);
    dialog.ngOnInit();
    expect(pending.observed).toBeTrue();
    dialog.cancel();
    expect(pending.observed).toBeFalse();
    expect(dialog.isUploading()).toBeFalse();
    expect(dialog.selectedFiles()).toEqual([]);
    expect(close).toHaveBeenCalledOnceWith();
    pending.next([{ fileId: '1', fileName: 'receipt.jpg' }]);
    expect(message).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('aborts the active upload when the dialog is destroyed', () => {
    const dialog = create(photo());
    const pending = new Subject<{ fileId: string; fileName: string }[]>();
    upload.and.returnValue(pending);
    dialog.ngOnInit();
    dialog.ngOnDestroy();
    expect(pending.observed).toBeFalse();
    expect(dialog.isUploading()).toBeFalse();
  });

  it('cancels the underlying HTTP request when Cancel is clicked', () => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), DriveDocsService,
      { provide: DynamicDialogConfig, useValue: { data: { capturedFile: photo() } } },
      { provide: DynamicDialogRef, useValue: { close: jasmine.createSpy('close') } },
      { provide: MessageService, useValue: { add: jasmine.createSpy('add') } },
      { provide: GenericService, useValue: { businessSelectItems: signal([{ label: 'Business', value: '123' }]) } },
    ] });
    const dialog = TestBed.runInInjectionContext(() => new QuickUploadDriveDialogComponent());
    dialog.ngOnInit();
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne(`${environment.apiUrl}documents/me/upload-to-inbox`);
    expect(request.cancelled).toBeFalse();
    dialog.cancel();
    expect(request.cancelled).toBeTrue();
    expect(dialog.isUploading()).toBeFalse();
    http.verify();
  });

  it('renders active Cancel and black loading Upload beside each other at phone width', () => {
    const pending = new Subject<{ fileId: string; fileName: string }[]>();
    const closeDialog = jasmine.createSpy('close');
    TestBed.configureTestingModule({
      imports: [QuickUploadDriveDialogComponent],
      providers: [
        provideRouter([]),
        { provide: DynamicDialogConfig, useValue: { data: { capturedFile: photo() } } },
        { provide: DynamicDialogRef, useValue: { close: closeDialog } },
        { provide: DriveDocsService, useValue: { uploadFilesToInbox: () => pending } },
        { provide: MessageService, useValue: { add: jasmine.createSpy('add') } },
        { provide: GenericService, useValue: { businessSelectItems: signal([{ label: 'Business', value: '123' }]) } },
      ],
    });
    const fixture = TestBed.createComponent(QuickUploadDriveDialogComponent);
    fixture.nativeElement.style.display = 'block';
    fixture.nativeElement.style.width = '280px';
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('.quick-upload__actions button') as NodeListOf<HTMLButtonElement>;
    const cancelButton = buttons[0];
    const uploadButton = buttons[1];
    expect(cancelButton.disabled).toBeFalse();
    expect(cancelButton.classList.contains('white-border')).toBeTrue();
    expect(uploadButton.classList.contains('black')).toBeTrue();
    expect(uploadButton.classList.contains('disabled')).toBeFalse();
    expect(uploadButton.querySelector('.p-button-loading-icon')).not.toBeNull();
    expect(Math.abs(cancelButton.getBoundingClientRect().top - uploadButton.getBoundingClientRect().top)).toBeLessThan(1);
    expect(cancelButton.getBoundingClientRect().width).toBeLessThan(145);
    expect(uploadButton.getBoundingClientRect().width).toBeLessThan(145);
    expect(getComputedStyle(uploadButton).backgroundColor).toBe('rgb(0, 0, 0)');
    cancelButton.click();
    expect(pending.observed).toBeFalse();
    expect(closeDialog).toHaveBeenCalled();
    fixture.destroy();
  });
});
