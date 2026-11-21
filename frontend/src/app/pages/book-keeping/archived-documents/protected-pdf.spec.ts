import { Subject, of, throwError } from "rxjs";
import { ProtectedPdfUploadFlow } from "src/app/services/protected-pdf-upload";
describe("Protected PDF upload user flow", () => {
  const file = () =>
    new File(["synthetic"], "open.pdf", { type: "application/pdf" });
  function subject() {
    const flow = new ProtectedPdfUploadFlow(() => "stable-request-0001");
    flow.open(
      { protectedDocumentId: 7, canUploadOpenCopy: true, name: "locked.pdf" },
      "original-business",
    );
    flow.select(file());
    flow.confirmed = true;
    return flow;
  }
  it("uses the explicit document and captured business, never file name as identity", () => {
    const flow = subject(),
      send = jasmine.createSpy().and.returnValue(of({ accepted: true })),
      accepted = jasmine.createSpy();
    flow.submit(send, accepted);
    expect(send.calls.mostRecent().args[0]).toEqual({
      documentId: 7,
      businessNumber: "original-business",
      file: flow.file,
      key: "stable-request-0001",
      confirmed: true,
    });
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(flow.document()).toBeNull();
  });
  it("requires explicit confirmation", () => {
    const flow = subject(),
      send = jasmine.createSpy();
    flow.confirmed = false;
    flow.submit(send, () => undefined);
    expect(send).not.toHaveBeenCalled();
  });
  it("retains the same document/file/key after failure and allows retry", () => {
    const flow = subject(),
      send = jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { message: "retry" } })));
    const selected = flow.file;
    flow.submit(send, () => undefined);
    expect(flow.busy()).toBeFalse();
    expect(flow.key).toBe("stable-request-0001");
    expect(flow.file).toBe(selected);
    expect(flow.document()?.protectedDocumentId).toBe(7);
    expect(flow.error).toBe("retry");
    send.and.returnValue(of({ accepted: true }));
    flow.submit(send, () => undefined);
    expect(send.calls.count()).toBe(2);
    expect(send.calls.argsFor(0)[0].key).toBe(send.calls.argsFor(1)[0].key);
  });
  it("blocks duplicate clicks while pending", () => {
    const flow = subject(),
      send = jasmine.createSpy().and.returnValue(new Subject());
    flow.submit(send, () => undefined);
    flow.submit(send, () => undefined);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not report upload success for an unaccepted reservation", () => {
    const flow = subject(),
      accepted = jasmine.createSpy();
    flow.submit(() => of({ accepted: false }), accepted);
    expect(accepted).not.toHaveBeenCalled();
    expect(flow.document()).toBeTruthy();
    expect(flow.error).toContain("טרם");
  });
});
