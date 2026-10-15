const http = require("node:http");
const { MAX_INPUT, RenderError, validateJob } = require("./contract.cjs");

function createServer({ render, logger = console.log }) {
  let active = 0,
    draining = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const fail = (status, code) => {
      if (!res.destroyed && !res.headersSent) {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code }));
      }
    };
    if (req.url === "/healthz" && req.method === "GET") {
      res.writeHead(draining ? 503 : 200, { "Content-Type": "text/plain" });
      res.end(draining ? "draining" : "ok");
      return;
    }
    if (req.url !== "/v1/render" || req.method !== "POST") {
      fail(404, "NOT_FOUND");
      return;
    }
    if (draining || active >= 1) {
      res.setHeader("Retry-After", "1");
      fail(503, "RENDER_CAPACITY_BUSY");
      req.resume();
      return;
    }
    if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) {
      fail(415, "JSON_REQUIRED");
      req.resume();
      return;
    }
    if (Number(req.headers["content-length"]) > MAX_INPUT) {
      fail(413, "RENDER_JOB_TOO_LARGE");
      req.resume();
      return;
    }
    active++;
    let job;
    const start = Date.now();
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_INPUT)
          throw new RenderError("RENDER_JOB_TOO_LARGE", 413);
        chunks.push(chunk);
      }
      try {
        job = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new RenderError("INVALID_JSON", 400);
      }
      validateJob(job);
      const bytes = await render(job);
      if (!res.destroyed) {
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Length": bytes.length,
          "X-Pdf-Request-Id": job.requestId,
        });
        res.end(bytes);
      }
      logger(
        JSON.stringify({
          event: "pdf_render",
          requestId: job.requestId,
          status: 200,
          durationMs: Date.now() - start,
        })
      );
    } catch (error) {
      const status = error instanceof RenderError ? error.status : 500;
      const code =
        error instanceof RenderError ? error.code : "PDF_RENDER_FAILED";
      fail(status, code);
      // Use the ID only after schema validation; never log a rejected payload.
      logger(
        JSON.stringify({
          event: "pdf_render",
          status,
          code,
          durationMs: Date.now() - start,
        })
      );
    } finally {
      active--;
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.drain = () => {
    draining = true;
    return new Promise((resolve) => server.close(resolve));
  };
  return server;
}
if (require.main === module) {
  const fs = require("node:fs");
  const path = require("node:path");
  const executablePath = "/usr/bin/chromium";
  fs.accessSync(executablePath, fs.constants.X_OK);
  const { createRenderer } = require("./renderer.cjs");
  const render = createRenderer({
    puppeteer: require("puppeteer-core"),
    template: require("../dist/document-pdf.template.js"),
    executablePath,
    fontDirectory: path.join(__dirname, "../fonts"),
  });
  const server = createServer({ render });
  server.listen(Number(process.env.PORT || 8080), "0.0.0.0", () =>
    console.log(
      JSON.stringify({ event: "pdf_service_ready", node: process.version })
    )
  );
  process.once("SIGTERM", () => {
    const stop = setTimeout(() => process.exit(1), 8000);
    stop.unref();
    server.drain().then(() => {
      clearTimeout(stop);
      process.exit(0);
    });
  });
}
module.exports = { createServer };
