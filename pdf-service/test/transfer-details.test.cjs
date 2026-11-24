const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateJob } = require("../src/contract.cjs");
const { buildDocumentHtml } = require("../dist/document-pdf.template.js");
const details = { bank: "Example bank", branch: "001", accountNumber: "00012345", beneficiary: "<b>Example</b>" };
const job = (transferDetails) => ({ version: 1, requestId: "transfer-test", document: {
  title: "Invoice", documentType: "original", date: "24-11-2026", preview: false,
  items: [], totals: [], payments: [], paymentTotals: [], transferDetails,
}});
test("shared service template renders the optional instructions with escaping and leading zeros", () => {
  const accepted = validateJob(job(details));
  const html = buildDocumentHtml(accepted.document, "");
  assert.ok(html.includes('<bdi dir="ltr">00012345</bdi>'));
  assert.ok(html.includes("&lt;b&gt;Example&lt;/b&gt;"));
  assert.ok(!html.includes('<section class="payments">'));
});
test("legacy jobs without transfer details retain their layout", () => {
  for (const value of [null, undefined]) {
    assert.ok(!buildDocumentHtml(validateJob(job(value)).document, "").includes('<section class="transfer-details">'));
  }
});
test("service rejects malformed transfer details before rendering", () => {
  for (const value of [[], "bank", {}, { ...details, branch: 1 }, { ...details, bank: " " },
    { ...details, accountNumber: "0".repeat(41) }]) {
    assert.throws(() => validateJob(job(value)), { code: "INVALID_RENDER_JOB" });
  }
});
