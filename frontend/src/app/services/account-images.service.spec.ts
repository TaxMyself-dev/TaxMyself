import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  provideHttpClientTesting,
  HttpTestingController,
} from "@angular/common/http/testing";
import {
  AccountImagesService,
  accountImageError,
  MAX_ACCOUNT_IMAGE_BYTES,
} from "./account-images.service";

describe("AccountImagesService", () => {
  let service: AccountImagesService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AccountImagesService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it("sends a logo to its specific business as multipart without a forced content type", () => {
    const file = new File(["png"], "logo.png", { type: "image/png" });
    service.upload(file, 42).subscribe();
    const req = http.expectOne(service.endpoint(42));
    expect(req.request.method).toBe("POST");
    expect(req.request.body.get("file")).toBe(file);
    expect(req.request.headers.has("Content-Type")).toBeFalse();
    req.flush({ imagePath: "business/42/logo.png" });
  });
  it("loads the application profile via authenticated HttpClient Blob rather than an img URL", () => {
    service.load().subscribe();
    const req = http.expectOne(service.endpoint());
    expect(req.request.responseType).toBe("blob");
    expect(req.request.url.endsWith("auth/profile-image")).toBeTrue();
    req.flush(new Blob(["image"], { type: "image/png" }));
  });
  it("removes only the selected business logo", () => {
    service.remove(7).subscribe();
    const req = http.expectOne(service.endpoint(7));
    expect(req.request.method).toBe("DELETE");
    req.flush({ imagePath: null });
  });
  it("rejects active/non-image uploads and empty or oversized images", () => {
    expect(
      accountImageError(
        new File(["<svg/>"], "x.svg", { type: "image/svg+xml" })
      )
    ).toBeTruthy();
    expect(
      accountImageError(new File([], "x.png", { type: "image/png" }))
    ).toBeTruthy();
    expect(
      accountImageError(
        new File([new Uint8Array(MAX_ACCOUNT_IMAGE_BYTES + 1)], "x.jpg", {
          type: "image/jpeg",
        })
      )
    ).toBeTruthy();
    expect(
      accountImageError(new File(["png"], "x.png", { type: "image/png" }))
    ).toBeNull();
  });
});
