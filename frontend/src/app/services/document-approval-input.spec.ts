import { hasRequiredDocumentInput } from "./document-approval-input";
describe("manual approval of documents without extraction", () => {
  it("does not invent a missing amount or date", () => {
    const fields = { amount: null, date: "" };
    expect(hasRequiredDocumentInput(fields)).toBeFalse();
    expect(fields).toEqual({ amount: null, date: "" });
  });
  it("permits explicit data to reach the existing accounting validations", () => {
    expect(
      hasRequiredDocumentInput({ amount: 12, date: "2026-11-19" })
    ).toBeTrue();
    expect(
      hasRequiredDocumentInput({ amount: 0, date: "2026-11-19" })
    ).toBeTrue();
  });
  it("rejects blank, non-finite and invalid-calendar values", () => {
    for (const fields of [
      { amount: "", date: "2026-11-19" },
      { amount: NaN, date: "2026-11-19" },
      { amount: 12, date: "2026-02-31" },
      { amount: 12, date: "" },
    ])
      expect(hasRequiredDocumentInput(fields)).toBeFalse();
  });
});
