import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { DriveDocsService } from "./drive-docs.service";
import { IntegrationsService } from "./integrations.service";
import { environment } from "src/environments/environment";
import { documentRetryMessage } from "./document-retry";
describe("document retry transport and feedback", () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it("sends exact selected Drive identities and business to the protected endpoint", () => {
    TestBed.inject(DriveDocsService)
      .retryProcessing("business", ["file-a", "file-b"])
      .subscribe();
    const request = http.expectOne(
      environment.apiUrl + "documents/me/retry-processing"
    );
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({
      businessNumber: "business",
      fileIds: ["file-a", "file-b"],
    });
    expect(request.request.headers.get("businessnumber")).toBe("business");
    request.flush({ results: [], retried: 2, skipped: 0 });
  });
  it("retries all mailbox pages sequentially and aggregates partial outcomes", () => {
    let result: any;
    TestBed.inject(IntegrationsService)
      .retryMailboxProcessing(17)
      .subscribe((r) => (result = r));
    const url = environment.apiUrl + "integrations/email/17/retry-processing";
    const first = http.expectOne(url);
    expect(first.request.body).toEqual({ cursor: 0 });
    first.flush({
      results: [{ fileId: "a", status: "REQUEUED" }],
      retried: 1,
      skipped: 0,
      nextCursor: 100,
    });
    expect(result).toBeUndefined();
    const second = http.expectOne(url);
    expect(second.request.body).toEqual({ cursor: 100 });
    second.flush({
      results: [{ fileId: "b", status: "UNKNOWN_OUTCOME" }],
      retried: 0,
      skipped: 1,
    });
    expect(result.retried).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.results.length).toBe(2);
  });
  it("explains uncertain outcomes and passwords instead of claiming all succeeded", () => {
    const text = documentRetryMessage({
      results: [
        { fileId: "a", status: "UNKNOWN_OUTCOME" },
        { fileId: "b", status: "PASSWORD_REQUIRED" },
      ],
      retried: 0,
      skipped: 2,
    });
    expect(text).toContain("בדיקה ידנית");
    expect(text).toContain("ללא סיסמה");
    expect(text).toContain("0 מסמכים");
  });
});
