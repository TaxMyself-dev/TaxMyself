const fs = require("node:fs");
const path = require("node:path");
const { RenderError, validateJob } = require("./contract.cjs");

// Pure rendering only: no DB, signing, mail, storage or acknowledgement side effects.
function createRenderer({
  puppeteer,
  template,
  executablePath,
  fontDirectory,
  deadlineMs = 45000,
  diagnostics = process.env.NODE_ENV === "development",
  logger = console.log,
}) {
  let fonts, cachedBrowser, launchPromise;
  let active = false, disposed = false, uses = 0;
  const killBrowser = (browser) => {
    if (cachedBrowser === browser) cachedBrowser = undefined;
    try { browser?.process()?.kill("SIGKILL"); } catch {}
  };
  const closeBrowser = async (browser) => {
    if (!browser) return;
    if (cachedBrowser === browser) cachedBrowser = undefined;
    let timer;
    try {
      await Promise.race([browser.close(), new Promise((resolve) => {
        timer = setTimeout(() => { killBrowser(browser); resolve(); }, 2000);
      })]);
    } catch { killBrowser(browser); }
    finally { clearTimeout(timer); }
  };
  const acquire = async () => {
    if (disposed) throw new RenderError("RENDERER_CLOSED", 503);
    if (cachedBrowser?.connected && uses < 100) return cachedBrowser;
    await closeBrowser(cachedBrowser);
    if (!launchPromise) {
      const pending = puppeteer.launch({
        executablePath, headless: true, timeout: 15000, protocolTimeout: 20000,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      }).then(async (browser) => {
        if (disposed || launchPromise !== pending) {
          await closeBrowser(browser);
          throw new RenderError("RENDER_TIMEOUT", 504);
        }
        cachedBrowser = browser;
        uses = 0;
        return browser;
      });
      launchPromise = pending;
    }
    const pending = launchPromise;
    try { return await pending; }
    finally { if (launchPromise === pending) launchPromise = undefined; }
  };
  const render = async function render(job) {
    if (active) throw new RenderError("RENDER_CAPACITY_BUSY", 503);
    if (disposed) throw new RenderError("RENDERER_CLOSED", 503);
    const started = performance.now();
    let stageStarted = started;
    let measuredStage = "PREPARE";
    const stages = {};
    const mark = (next) => {
      const now = performance.now();
      stages[measuredStage] = Math.round(now - stageStarted);
      measuredStage = next;
      stageStarted = now;
    };
    validateJob(job);
    fonts ||= template.fontCss(
      fs
        .readFileSync(path.join(fontDirectory, "Simpler-Regular.otf"))
        .toString("base64"),
      fs
        .readFileSync(path.join(fontDirectory, "Simpler-Bold.otf"))
        .toString("base64")
    );
    const html = template.buildDocumentHtml(job.document, fonts);
    if (Buffer.byteLength(html) > 8 * 1024 * 1024)
      throw new RenderError("RENDER_JOB_TOO_LARGE", 413);
    active = true;
    const requests = new Map();
    const requestCounts = { started: 0, finished: 0, failed: 0, blocked: 0 };
    let browser, context,
      timer, killed = false,
      finished = false,
      phase = "BROWSER_LAUNCH";
    const kill = () => {
      if (killed) return;
      killed = true;
      launchPromise = undefined;
      killBrowser(browser);
    };
    try {
      mark("BROWSER_LAUNCH");
      return await Promise.race([
        (async () => {
          browser = await acquire();
          if (finished) {
            kill();
            throw new RenderError("RENDER_TIMEOUT", 504);
          }
          phase = "PAGE_SETUP";
          mark(phase);
          context = await browser.createBrowserContext();
          if (finished) { await context.close(); throw new RenderError("RENDER_TIMEOUT", 504); }
          const page = await context.newPage();
          await page.setJavaScriptEnabled(false);
          await page.setRequestInterception(true);
          page.on("requestfinished", (request) => { requestCounts.finished++; requests.delete(request); });
          page.on("requestfailed", (request) => { requestCounts.failed++; requests.delete(request); });
          page.on("request", (request) => {
            requestCounts.started++;
            requests.set(request, request.resourceType());
            const allowed =
              request.url().startsWith("data:") ||
              request.url() === "about:blank";
            if (!allowed) requestCounts.blocked++;
            Promise.resolve(
              allowed ? request.continue() : request.abort()
            ).catch(() => {});
          });
          phase = "HTML_LOAD";
          mark(phase);
          try {
            await page.setContent(html, {
              waitUntil: "networkidle0",
              timeout: 20000,
            });
          } catch (error) {
            if (diagnostics) {
              // Counts/types only: never URLs, HTML, document text or images.
              try { logger(JSON.stringify({ event: "pdf_html_load_failure", requestId: job.requestId,
                timeout: error?.name === "TimeoutError", requests: requestCounts,
                pendingResourceTypes: [...requests.values()], browserConnected: browser.connected })); } catch {}
            }
            throw error;
          }
          phase = "PDF_PRINT";
          mark(phase);
          const bytes = Buffer.from(
            await page.pdf({
              format: "A4",
              printBackground: true,
              waitForFonts: true,
              timeout: 20000,
              margin: {
                top: "14mm",
                right: "15mm",
                bottom: "22mm",
                left: "15mm",
              },
              displayHeaderFooter: true,
              headerTemplate: "<span></span>",
              footerTemplate: template.buildDocumentFooter(
                job.document.preview,
                fonts
              ),
            })
          );
          if (
            bytes.length > 20 * 1024 * 1024 ||
            bytes.subarray(0, 5).toString() !== "%PDF-"
          )
            throw new RenderError("INVALID_PDF_OUTPUT", 502);
          return bytes;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            kill();
            reject(new RenderError("RENDER_TIMEOUT", 504));
          }, deadlineMs);
        }),
      ]);
    } catch (error) {
      kill();
      if (error instanceof RenderError) throw error;
      if (error?.name === "TimeoutError")
        throw new RenderError("RENDER_TIMEOUT", 504);
      throw new RenderError("RENDER_" + phase + "_FAILED", 502);
    } finally {
      mark("CONTEXT_CLOSE");
      finished = true;
      clearTimeout(timer);
      if (context) {
        let closeTimer;
        try {
          await Promise.race([context.close(), new Promise((resolve) => {
            closeTimer = setTimeout(() => { kill(); resolve(); }, 2000);
          })]);
        } catch { kill(); }
        finally { clearTimeout(closeTimer); }
      }
      uses++;
      active = false;
      mark("DONE");
      if (diagnostics) {
        // Timings only: never include document content, images or credentials.
        try {
          logger(JSON.stringify({ event: "pdf_render_stages", requestId: job.requestId,
            stagesMs: stages, totalMs: Math.round(performance.now() - started) }));
        } catch {}
      }
    }
  };
  render.close = async () => {
    disposed = true;
    const pending = launchPromise;
    launchPromise = undefined;
    await closeBrowser(cachedBrowser);
    if (pending) { try { await pending; } catch {} }
  };
  return render;
}
module.exports = { createRenderer };
