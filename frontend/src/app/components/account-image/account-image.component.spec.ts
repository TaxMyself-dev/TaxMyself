import { TestBed } from "@angular/core/testing";
import { Subject } from "rxjs";
import { AccountImageComponent } from "./account-image.component";
import { AccountImagesService } from "src/app/services/account-images.service";

describe("AccountImageComponent", () => {
  let component: AccountImageComponent;
  let load: Subject<Blob>;
  let mutation: Subject<{ imagePath: string | null }>;
  let images: jasmine.SpyObj<AccountImagesService>;
  beforeEach(() => {
    load = new Subject();
    mutation = new Subject();
    images = jasmine.createSpyObj("images", ["load", "upload", "remove"]);
    images.load.and.returnValue(load);
    images.upload.and.returnValue(mutation);
    images.remove.and.returnValue(mutation);
    TestBed.configureTestingModule({
      providers: [{ provide: AccountImagesService, useValue: images }],
    });
    component = TestBed.runInInjectionContext(
      () => new AccountImageComponent()
    );
    spyOn(URL, "createObjectURL").and.returnValue("blob:test");
    spyOn(URL, "revokeObjectURL");
  });
  afterEach(() => component.ngOnDestroy());
  async function rasterFile(): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    canvas.getContext('2d')!.fillRect(100, 0, 120, 200);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
    return new File([blob], 'transparent.png', { type: 'image/png' });
  }
  function picker(file: File): HTMLInputElement {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    return input;
  }
  it('center crops an actual raster profile to a square before upload', async () => {
    await component.select(picker(await rasterFile()));
    expect(component.error).toBe('');
    const bitmap = await createImageBitmap(component.pending!);
    expect(bitmap.width).toBe(200);
    expect(bitmap.height).toBe(200);
    bitmap.close();
  });
  it('keeps original transparent logo bytes and aspect ratio', async () => {
    component.businessId = 42;
    const file = await rasterFile();
    await component.select(picker(file));
    expect(component.pending).toBe(file);
    const bitmap = await createImageBitmap(component.pending!);
    expect(bitmap.width).toBe(320);
    expect(bitmap.height).toBe(200);
    bitmap.close();
  });
  it('rejects oversized decoded images and releases their bitmap', async () => {
    const bitmap = { width: 5000, height: 5000, close: jasmine.createSpy('close') };
    spyOn(window, 'createImageBitmap').and.returnValue(Promise.resolve(bitmap as unknown as ImageBitmap));
    await component.select(picker(new File(['image'], 'x.png', { type: 'image/png' })));
    expect(component.pending).toBeUndefined();
    expect(component.error).toBeTruthy();
    expect(bitmap.close).toHaveBeenCalled();
  });
  it("releases image URLs and cancels a previous context load", () => {
    component.imagePath = "old";
    component.ngOnChanges({ imagePath: {} as any });
    load.next(new Blob(["image"]));
    expect(component.url).toBe("blob:test");
    component.imagePath = null;
    component.ngOnChanges({ imagePath: {} as any });
    load.next(new Blob(["old-client"]));
    expect(component.url).toBe("");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
  it("does not send mutations while disabled or busy", () => {
    component.imagePath = "image";
    component.pending = new File(["png"], "x.png", { type: "image/png" });
    component.disabled = true;
    component.save();
    component.remove();
    component.disabled = false;
    component.busy = true;
    component.save();
    component.remove();
    expect(images.upload).not.toHaveBeenCalled();
    expect(images.remove).not.toHaveBeenCalled();
  });
  it("retains the selected image on failed upload and emits no cache change", () => {
    const changed = spyOn(component.imageChanged, "emit");
    component.pending = new File(["png"], "x.png", { type: "image/png" });
    component.save();
    mutation.error({ status: 500 });
    expect(component.pending).toBeDefined();
    expect(component.busy).toBeFalse();
    expect(component.error).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
  });
  it("treats a missing stored image as a quiet fallback", () => {
    component.imagePath = "missing";
    component.ngOnChanges({ imagePath: {} as any });
    load.error({ status: 404 });
    expect(component.error).toBe("");
    expect(component.busy).toBeFalse();
  });
  it("does not apply an old upload response after the user/business context changes", () => {
    const changed = spyOn(component.imageChanged, "emit");
    component.pending = new File(["png"], "x.png", { type: "image/png" });
    component.save();
    component.contextKey = "another-user";
    component.ngOnChanges({ contextKey: {} as any });
    mutation.next({ imagePath: "old-user/image.png" });
    expect(changed).not.toHaveBeenCalled();
    expect(component.pending).toBeUndefined();
  });
});
