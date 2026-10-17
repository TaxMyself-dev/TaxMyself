const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRenderer } = require("../src/renderer.cjs");
const job = {
  version: 1,
  requestId: "renderer-1",
  document: {
    title: "test",
    documentType: "original",
    date: "today",
    preview: false,
    items: [],
    totals: [],
    payments: [],
    paymentTotals: [],
  },
};
function fixture(t, { hang = false, fail = false, diagnostics = false, logger } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-render-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of ["Simpler-Regular.otf", "Simpler-Bold.otf"])
    fs.writeFileSync(path.join(dir, name), "font");
  let handler,
    killed = 0,
    closed = 0,
    scripts,
    interception;
  const page = {
    setJavaScriptEnabled: async (value) => {
      scripts = value;
    },
    setRequestInterception: async (value) => {
      interception = value;
    },
    on: (_, fn) => {
      handler = fn;
    },
    setContent: async () => {},
    pdf: async () => {
      if (fail) throw Error("failure");
      return Buffer.from("%PDF-test");
    },
  };
  const browser = {
    newPage: () => (hang ? new Promise(() => {}) : Promise.resolve(page)),
    process: () => ({
      kill: () => {
        killed++;
      },
    }),
    close: async () => {
      closed++;
    },
  };
  const render = createRenderer({
    puppeteer: { launch: async () => browser },
    template: {
      fontCss: () => "",
      buildDocumentHtml: () => "<html/>",
      buildDocumentFooter: () => "",
    },
    executablePath: "test",
    fontDirectory: dir,
    deadlineMs: 30,
    diagnostics,
    logger,
  });
  return {
    render,
    state: () => ({ handler, killed, closed, scripts, interception }),
  };
}
test("renderer blocks scripts and outbound requests, closes browser", async (t) => {
  const f = fixture(t);
  assert.equal((await f.render(job)).toString(), "%PDF-test");
  let aborted = 0,
    continued = 0;
  f.state().handler({
    url: () => "http://169.254.169.254",
    abort: () => aborted++,
    continue: () => continued++,
  });
  assert.equal(aborted, 1);
  assert.equal(continued, 0);
  assert.equal(f.state().scripts, false);
  assert.equal(f.state().interception, true);
  assert.equal(f.state().closed, 1);
});
test("deadline kills stuck browser and closes resources", async (t) => {
  const f = fixture(t, { hang: true });
  await assert.rejects(f.render(job), (e) => e.code === "RENDER_TIMEOUT");
  assert.equal(f.state().killed, 1);
  assert.equal(f.state().closed, 1);
});
test("render errors still close browser", async (t) => {
  const f = fixture(t, { fail: true });
  await assert.rejects(f.render(job));
  assert.equal(f.state().closed, 1);
});
test("development diagnostics report stages without document content", async (t) => {
  const logs = [];
  const f = fixture(t, { diagnostics: true, logger: (value) => logs.push(JSON.parse(value)) });
  await f.render(job);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, "pdf_render_stages");
  assert.deepEqual(Object.keys(logs[0].stagesMs), ["PREPARE", "BROWSER_LAUNCH", "PAGE_SETUP", "HTML_LOAD", "PDF_PRINT", "BROWSER_CLOSE"]);
  assert.equal(logs[0].document, undefined);
});
test("diagnostic logger errors cannot fail rendering", async (t) => {
  const f = fixture(t, { diagnostics: true, logger: () => { throw Error("logger failed"); } });
  assert.equal((await f.render(job)).toString(), "%PDF-test");
});
test("diagnostics stay silent when disabled", async (t) => {
  const logs = [];
  const f = fixture(t, { logger: (value) => logs.push(value) });
  await f.render(job);
  assert.deepEqual(logs, []);
});
