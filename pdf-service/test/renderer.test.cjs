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
function fixture(t, { hang = false, fail = false, diagnostics = false, logger, launchDelay = 0, failLoad = false, failAssets = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-render-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of ["Simpler-Regular.otf", "Simpler-Bold.otf"])
    fs.writeFileSync(path.join(dir, name), "font");
  let handler,
    killed = 0,
    closed = 0,
    contexts = 0, launches = 0,
    scripts,
    interception;
  const page = {
    setJavaScriptEnabled: async (value) => {
      scripts = value;
    },
    setRequestInterception: async (value) => {
      interception = value;
    },
    on: (event, fn) => {
      if (event === "request") handler = fn;
    },
    setContent: async () => { if (failLoad) throw Object.assign(Error("private html payload"), { name: "TimeoutError" }); },
    evaluate: async () => { if (failAssets) throw Error("asset failed"); },
    pdf: async () => {
      if (fail) throw Error("failure");
      return Buffer.from("%PDF-test");
    },
  };
  const browser = {
    connected: true,
    createBrowserContext: async () => {
      contexts++;
      return {
        newPage: () => (hang ? new Promise(() => {}) : Promise.resolve(page)),
        close: async () => { closed++; },
      };
    },
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
    puppeteer: { launch: async () => { launches++; if (launchDelay) await new Promise(r => setTimeout(r, launchDelay)); browser.connected = true; return browser; } },
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
  t.after(() => render.close());
  return {
    browser, render,
    state: () => ({ handler, killed, closed, scripts, interception, contexts, launches }),
  };
}
test("renderer blocks scripts and outbound requests, closes context", async (t) => {
  const f = fixture(t);
  assert.equal((await f.render(job)).toString(), "%PDF-test");
  let aborted = 0,
    continued = 0;
  f.state().handler({
    url: () => "http://169.254.169.254",
    resourceType: () => "image",
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
test("render errors still close context", async (t) => {
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
  assert.deepEqual(Object.keys(logs[0].stagesMs), ["PREPARE", "BROWSER_LAUNCH", "PAGE_SETUP", "HTML_LOAD", "ASSET_READY", "PDF_PRINT", "CONTEXT_CLOSE"]);
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

test("sequential renders share Chromium and create fresh isolated contexts", async (t) => {
  const f = fixture(t);
  await f.render(job); await f.render(job);
  assert.equal(f.state().launches, 1);
  assert.equal(f.state().contexts, 2);
  assert.equal(f.state().closed, 2);
  assert.equal(f.state().killed, 0);
});
test("disconnected browser relaunches for the next request", async (t) => {
  const f = fixture(t);
  await f.render(job); f.browser.connected = false; await f.render(job);
  assert.equal(f.state().launches, 2);
});
test("renderer rejects overlapping requests and can shut down", async (t) => {
  const f = fixture(t, { hang: true });
  const pending = assert.rejects(f.render(job), e => e.code === "RENDER_TIMEOUT");
  await assert.rejects(f.render(job), e => e.code === "RENDER_CAPACITY_BUSY");
  await pending;
  await f.render.close();
  await assert.rejects(f.render(job), e => e.code === "RENDERER_CLOSED");
});
test("browser is recycled after bounded successful use", async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 101; i++) await f.render(job);
  assert.equal(f.state().launches, 2);
});

test("failed context creation retires browser and next render recovers", async (t) => {
  const f = fixture(t);
  const create = f.browser.createBrowserContext;
  f.browser.createBrowserContext = async () => { throw Error("crashed"); };
  await assert.rejects(f.render(job), e => e.code === "RENDER_PAGE_SETUP_FAILED");
  f.browser.createBrowserContext = create;
  await f.render(job);
  assert.equal(f.state().launches, 2);
  assert.equal(f.state().killed, 1);
});
test("a browser launched after the deadline is closed instead of cached", async (t) => {
  const f = fixture(t, { launchDelay: 60 });
  await assert.rejects(f.render(job), e => e.code === "RENDER_TIMEOUT");
  await new Promise(r => setTimeout(r, 80));
  assert.equal(f.state().closed, 1);
  assert.equal(f.state().contexts, 0);
});

test("HTML load timeout reports resource counts without content", async (t) => {
  const logs = [];
  const f = fixture(t, { failLoad: true, diagnostics: true, logger: line => logs.push(JSON.parse(line)) });
  await assert.rejects(f.render(job), error => error.code === "RENDER_TIMEOUT");
  assert.equal(logs[0].event, "pdf_html_load_failure");
  assert.equal(logs[0].timeout, true);
  assert.deepEqual(logs[0].pendingResourceTypes, []);
  assert.deepEqual(logs[0].requests, { started: 0, finished: 0, failed: 0, blocked: 0 });
  assert.ok(!JSON.stringify(logs).includes("private"));
});

test("asset failure fails closed and releases the context", async (t) => {
  const f = fixture(t, { failAssets: true });
  await assert.rejects(f.render(job), e => e.code === "RENDER_ASSET_READY_FAILED");
  assert.equal(f.state().closed, 1);
  assert.equal(f.state().killed, 1);
});
