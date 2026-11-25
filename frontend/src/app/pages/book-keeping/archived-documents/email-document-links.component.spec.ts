import { TestBed, ComponentFixture } from "@angular/core/testing";
import { of, Subject, throwError } from "rxjs";
import { EmailDocumentLinksComponent } from "./email-document-links.component";
import { EmailDocumentLinksService } from "src/app/services/email-document-links.service";

describe("linked email document manual handling", () => {
  let fixture: ComponentFixture<EmailDocumentLinksComponent>;
  let api: any;
  const row = {
    id: "source-1",
    name: "invoice",
    subject: "חשבונית",
    from: "supplier@example.org",
    date: null,
    reason: "LINK_ACCESS_REQUIRED",
  };
  beforeEach(async () => {
    api = {
      list: jasmine
        .createSpy()
        .and.returnValue(of({ items: [row], nextCursor: null })),
      upload: jasmine.createSpy().and.returnValue(of({ accepted: true })),
      original: jasmine
        .createSpy()
        .and.returnValue(of({ url: "https://docs.example.org/invoice" })),
    };
    await TestBed.configureTestingModule({
      imports: [EmailDocumentLinksComponent],
      providers: [{ provide: EmailDocumentLinksService, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(EmailDocumentLinksComponent);
    fixture.componentRef.setInput("businessNumber", "123");
    fixture.detectChanges();
  });
  it("shows the source email and specific access reason", () => {
    expect(fixture.nativeElement.textContent).toContain("חשבונית");
    expect(fixture.nativeElement.textContent).toContain(
      "נדרשת התחברות או הרשאה"
    );
    expect(api.list).toHaveBeenCalledWith("123", undefined);
  });
  it("uploads against the exact source and business and removes only that row", () => {
    const component = fixture.componentInstance;
    const file = new File(["%PDF-fixture"], "invoice.pdf", {
      type: "application/pdf",
    });
    component.selected.set({ id: row.id, file });
    const completed = jasmine.createSpy();
    component.uploaded.subscribe(completed);
    component.upload(row);
    expect(api.upload).toHaveBeenCalledWith(row.id, "123", file);
    expect(component.items()).toEqual([]);
    expect(completed).toHaveBeenCalled();
  });
  it("retains the pending source when upload fails", () => {
    const component = fixture.componentInstance;
    api.upload.and.returnValue(throwError(() => new Error("failed")));
    component.selected.set({
      id: row.id,
      file: new File(["x"], "invoice.pdf"),
    });
    component.upload(row);
    expect(component.items().length).toBe(1);
    expect(component.busy()).toBe("");
    expect(component.message()).toContain("הקישור נשמר");
  });
  it("rejects unsupported files before sending", () => {
    const component = fixture.componentInstance;
    component.select(row, {
      target: { files: [new File(["x"], "image.png")] },
    } as any);
    component.upload(row);
    expect(api.upload).not.toHaveBeenCalled();
    expect(component.message()).toContain("PDF");
  });
  it("ignores stale business responses and resets the selected file", () => {
    const old = new Subject<any>();
    api.list.and.returnValue(old);
    fixture.componentInstance.load();
    api.list.and.returnValue(of({ items: [], nextCursor: null }));
    fixture.componentRef.setInput("businessNumber", "456");
    fixture.detectChanges();
    old.next({ items: [row], nextCursor: "old" });
    expect(fixture.componentInstance.items()).toEqual([]);
    expect(fixture.componentInstance.cursor()).toBeNull();
  });
  it("loads the next page without losing current rows", () => {
    fixture.componentInstance.cursor.set("next");
    api.list.and.returnValue(
      of({ items: [{ ...row, id: "source-2" }], nextCursor: null })
    );
    fixture.componentInstance.load(true);
    expect(api.list).toHaveBeenCalledWith("123", "next");
    expect(fixture.componentInstance.items().length).toBe(2);
  });
});
