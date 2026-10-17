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
  let fonts;
  return async function render(job) {
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
    let browser,
      timer,
      finished = false,
      phase = "BROWSER_LAUNCH";
    const kill = () => {
      try {
        browser?.process()?.kill("SIGKILL");
      } catch {}
    };
    try {
      mark("BROWSER_LAUNCH");
      return await Promise.race([
        (async () => {
          browser = await puppeteer.launch({
            executablePath,
            headless: true,
            timeout: 15000,
            protocolTimeout: 20000,
            args: ["--no-sandbox", "--disable-dev-shm-usage"],
          });
          if (finished) {
            kill();
            throw new RenderError("RENDER_TIMEOUT", 504);
          }
          phase = "PAGE_SETUP";
          mark(phase);
          const page = await browser.newPage();
          await page.setJavaScriptEnabled(false);
          await page.setRequestInterception(true);
          page.on("request", (request) => {
            const allowed =
              request.url().startsWith("data:") ||
              request.url() === "about:blank";
            Promise.resolve(
              allowed ? request.continue() : request.abort()
            ).catch(() => {});
          });
          phase = "HTML_LOAD";
          mark(phase);
          await page.setContent(html, {
            waitUntil: "networkidle0",
            timeout: 20000,
          });
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
      if (error instanceof RenderError) throw error;
      if (error?.name === "TimeoutError")
        throw new RenderError("RENDER_TIMEOUT", 504);
      throw new RenderError("RENDER_" + phase + "_FAILED", 502);
    } finally {
      mark("BROWSER_CLOSE");
      finished = true;
      clearTimeout(timer);
      if (browser) {
        let closeTimer;
        try {
          await Promise.race([
            browser.close(),
            new Promise((resolve) => {
              closeTimer = setTimeout(() => {
                kill();
                resolve();
              }, 2000);
            }),
          ]);
        } catch {
          kill();
        } finally {
          clearTimeout(closeTimer);
        }
      }
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
}
module.exports = { createRenderer };
