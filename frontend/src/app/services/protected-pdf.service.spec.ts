import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { DriveDocsService } from "./drive-docs.service";
import { environment } from "src/environments/environment";
describe("Protected PDF request identity", () => {
  let service: DriveDocsService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DriveDocsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it("sends document id, business, explicit confirmation and stable request key", () => {
    const file = new File(["synthetic"], "same-name.pdf", {
      type: "application/pdf",
    });
    service
      .replaceProtectedPdf(7, "123", file, "stable-request-0001", true)
      .subscribe();
    const request = http.expectOne(
      `${environment.apiUrl}documents/me/protected/7/replacement`,
    );
    expect(request.request.body.get("businessNumber")).toBe("123");
    expect(request.request.body.get("idempotencyKey")).toBe(
      "stable-request-0001",
    );
    expect(request.request.body.get("confirmed")).toBe("true");
    expect(request.request.body.has("firebaseId")).toBeFalse();
    expect(request.request.headers.has("Content-Type")).toBeFalse();
    request.flush({ accepted: true });
  });
  it("retries delivery without reuploading or selecting another document by hash/name", () => {
    service.retryProtectedDelivery(7, "123").subscribe();
    const request = http.expectOne(
      `${environment.apiUrl}documents/me/protected/7/retry-delivery`,
    );
    expect(request.request.body).toEqual({ businessNumber: "123" });
    request.flush({ queued: true });
  });
});
