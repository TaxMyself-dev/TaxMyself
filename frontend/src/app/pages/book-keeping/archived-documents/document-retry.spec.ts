import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { of, Subject, throwError } from "rxjs";
import { ActivatedRoute } from "@angular/router";
import { MessageService, ConfirmationService } from "primeng/api";
import { DialogService } from "primeng/dynamicdialog";
import { ArchivedDocumentsPage } from "./archived-documents.page";
import { AuthService } from "src/app/services/auth.service";
import { GenericService } from "src/app/services/generic.service";
import { DriveDocsService } from "src/app/services/drive-docs.service";
import { ExpenseDataService } from "src/app/services/expense-data.service";
import { ReportReviewService } from "src/app/services/report-review.service";
describe("archive single and selected retry controls", () => {
  let page: ArchivedDocumentsPage,
    send: jasmine.Spy,
    viewing = false;
  beforeEach(() => {
    viewing = false;
    send = jasmine.createSpy().and.returnValue(new Subject());
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { isViewingAsClient: () => viewing },
        },
        {
          provide: GenericService,
          useValue: { businesses: signal([]), businessSelectItems: () => [] },
        },
        {
          provide: DriveDocsService,
          useValue: { retryProcessing: send, getArchivedItems: () => of([]) },
        },
        { provide: MessageService, useValue: { add: jasmine.createSpy() } },
        { provide: ConfirmationService, useValue: {} },
        { provide: ActivatedRoute, useValue: {} },
        { provide: DialogService, useValue: {} },
        { provide: ExpenseDataService, useValue: {} },
        { provide: ReportReviewService, useValue: {} },
      ],
    });
    page = TestBed.runInInjectionContext(() => new ArchivedDocumentsPage());
    page.selectedBusinessNumber.set("business");
  });
  it("single-row action sends the file identity and blocks duplicate clicks", () => {
    (page as any).setFileActions();
    const action = page
      .fileActions()
      .find((a) => a.name === "retry-processing")!;
    const row: any = {
      canRetryProcessing: true,
      driveFileId: "file",
      itemType: "DOCUMENT",
    };
    expect(action.showWhen!(row)).toBe(true);
    action.action({} as any, row);
    action.action({} as any, row);
    expect(send).toHaveBeenCalledOnceWith("business", ["file"]);
    expect(page.retryBusy()).toBe(true);
  });
  it("only retains selected eligible document files", () => {
    page.selectRetryRows([
      { driveFileId: "file", canRetryProcessing: true },
      { driveFileId: "password", canRetryProcessing: false },
      { itemType: "EXPENSE" },
    ] as any);
    expect(page.selectedRetryFiles()).toEqual(["file"]);
  });
  it("does not retry while viewing a client", () => {
    viewing = true;
    page.retryProcessing(["file"]);
    expect(send).not.toHaveBeenCalled();
  });
  it("deduplicates selected files and reports partial success", () => {
    send.and.returnValue(
      of({
        results: [{ fileId: "b", status: "UNKNOWN_OUTCOME" }],
        retried: 1,
        skipped: 1,
      })
    );
    page.retryProcessing(["a", "a", "b"]);
    expect(send).toHaveBeenCalledOnceWith("business", ["a", "b"]);
    expect(page.retryFeedback()).toContain("בדיקה ידנית");
    expect(page.retryBusy()).toBe(false);
  });
  it("keeps a configuration failure actionable and allows a later click", () => {
    send.and.returnValue(throwError(() => ({ status: 503 })));
    page.retryProcessing(["a"]);
    expect(page.retryFeedback()).toContain("הגדרות");
    expect(page.retryBusy()).toBe(false);
  });
});
