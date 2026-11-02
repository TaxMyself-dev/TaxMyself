const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../src/server.cjs");
const { validateJob } = require("../src/contract.cjs");
const job = () => ({
  version: 1,
  requestId: "test-1",
  document: {
    title: "קבלה",
    documentType: "מקור",
    date: "15-10-2026",
    preview: true,
    items: [],
    payments: [],
    totals: [],
    paymentTotals: [],
  },
});
async function listen(t, render) {
  const logs = [];
  const server = createServer({ render, logger: (line) => logs.push(line) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return { url: "http://127.0.0.1:" + server.address().port, logs, server };
}
test("version and model validation reject malformed/oversized jobs and external logos", () => {
  assert.equal(validateJob(job()).version, 1);
  for (const change of [
    { version: 2 },
    { requestId: "secret\nvalue" },
    {
      document: { ...job().document, logoDataUri: "https://169.254.169.254/" },
    },
    { document: { ...job().document, items: Array(1001).fill({}) } },
    { document: { ...job().document, items: [{ description: 123 }] } },
  ])
    assert.throws(() => validateJob({ ...job(), ...change }));
});
test("HTTP returns PDF and correlation ID without logging document content", async (t) => {
  const { url, logs } = await listen(t, async () => Buffer.from("%PDF-test"));
  const response = await fetch(url + "/v1/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(job()),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("x-pdf-request-id"), "test-1");
  assert.equal(await response.text(), "%PDF-test");
  assert.ok(!logs.join().includes("קבלה"));
});
test("HTTP rejects invalid input before rendering, returns sanitized failures", async (t) => {
  let calls = 0;
  const { url, logs } = await listen(t, async () => {
    calls++;
    throw Error("private token and customer payload");
  });
  const send = (body) =>
    fetch(url + "/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  assert.equal((await send("{")).status, 400);
  assert.equal(calls, 0);
  const response = await send(JSON.stringify(job()));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { code: "PDF_RENDER_FAILED" });
  assert.ok(!logs.join().includes("private"));
});
test("capacity protects one browser per instance, health stays responsive", async (t) => {
  let finish;
  const { url } = await listen(
    t,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const send = () =>
    fetch(url + "/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(job()),
    });
  const first = send();
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal((await fetch(url + "/healthz")).status, 200);
  assert.equal((await send()).status, 503);
  finish(Buffer.from("%PDF-test"));
  assert.equal((await first).status, 200);
});
test("draining refuses new renders", async (t) => {
  const { server } = await listen(t, async () => Buffer.from("%PDF-test"));
  await server.drain();
  assert.equal(server.listening, false);
});
test("HTTP rejects unsupported content types and oversized bodies before rendering", async (t) => {
  let calls = 0;
  const { url } = await listen(t, async () => {
    calls++;
    return Buffer.from("%PDF-test");
  });
  assert.equal(
    (await fetch(url + "/v1/render", { method: "POST", body: "text" })).status,
    415
  );
  assert.equal(
    (
      await fetch(url + "/v1/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: " ".repeat(8 * 1024 * 1024 + 1),
      })
    ).status,
    413
  );
  assert.equal(calls, 0);
});
