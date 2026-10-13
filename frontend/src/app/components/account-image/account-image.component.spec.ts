import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AccountImageComponent } from './account-image.component';
import { AccountImagesService } from 'src/app/services/account-images.service';

describe('AccountImageComponent', () => {
  let component: AccountImageComponent;
  let load: Subject<Blob>;
  let mutation: Subject<{ imagePath: string | null }>;
  let images: jasmine.SpyObj<AccountImagesService>;
  beforeEach(() => {
    load = new Subject(); mutation = new Subject();
    images = jasmine.createSpyObj('images', ['load', 'upload', 'remove']);
    images.load.and.returnValue(load); images.upload.and.returnValue(mutation); images.remove.and.returnValue(mutation);
    TestBed.configureTestingModule({ providers: [{ provide: AccountImagesService, useValue: images }] });
    component = TestBed.runInInjectionContext(() => new AccountImageComponent());
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test'); spyOn(URL, 'revokeObjectURL');
  });
  afterEach(() => component.ngOnDestroy());
  it('releases image URLs and cancels a previous context load', () => {
    component.imagePath = 'old'; component.ngOnChanges({ imagePath: {} as any });
    load.next(new Blob(['image'])); expect(component.url).toBe('blob:test');
    component.imagePath = null; component.ngOnChanges({ imagePath: {} as any });
    load.next(new Blob(['old-client']));
    expect(component.url).toBe(''); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
  it('does not send mutations while disabled or busy', () => {
    component.imagePath = 'image'; component.pending = new File(['png'], 'x.png', { type: 'image/png' });
    component.disabled = true; component.save(); component.remove();
    component.disabled = false; component.busy = true; component.save(); component.remove();
    expect(images.upload).not.toHaveBeenCalled(); expect(images.remove).not.toHaveBeenCalled();
  });
  it('retains the selected image on failed upload and emits no cache change', () => {
    const changed = spyOn(component.imageChanged, 'emit');
    component.pending = new File(['png'], 'x.png', { type: 'image/png' }); component.save();
    mutation.error({ status: 500 });
    expect(component.pending).toBeDefined(); expect(component.busy).toBeFalse();
    expect(component.error).toBeTruthy(); expect(changed).not.toHaveBeenCalled();
  });
  it('treats a missing stored image as a quiet fallback', () => {
    component.imagePath = 'missing'; component.ngOnChanges({ imagePath: {} as any });
    load.error({ status: 404 }); expect(component.error).toBe(''); expect(component.busy).toBeFalse();
  });
  it('does not apply an old upload response after the user/business context changes', () => {
    const changed = spyOn(component.imageChanged, 'emit');
    component.pending = new File(['png'], 'x.png', { type: 'image/png' }); component.save();
    component.contextKey = 'another-user'; component.ngOnChanges({ contextKey: {} as any });
    mutation.next({ imagePath: 'old-user/image.png' });
    expect(changed).not.toHaveBeenCalled(); expect(component.pending).toBeUndefined();
  });
});
