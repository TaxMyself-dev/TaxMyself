// Local-only entry point. No cloud, database, signing credentials or template build.
const fs = require("node:fs");
const path = require("node:path");
if (process.env.K_SERVICE) throw Error("Local PDF entry point cannot run on Cloud Run");
process.env.NODE_ENV = "development";
const executablePath = process.env.PDF_CHROME_EXECUTABLE || "C:/Program Files/Google/Chrome/Application/chrome.exe";
fs.accessSync(executablePath);
const { createRenderer } = require("../src/renderer.cjs");
const { createServer } = require("../src/server.cjs");
const render = createRenderer({
  puppeteer: require("puppeteer-core"),
  template: require("../dist/document-pdf.template.js"),
  executablePath,
  fontDirectory: path.resolve(__dirname, "../../backend/src/assets/document-fonts"),
});
const server = createServer({ render });
const port = Number(process.env.PDF_DEV_PORT || 8082);
server.listen(port, "127.0.0.1", () => console.log(JSON.stringify({
  event: "pdf_service_ready", node: process.version, port, local: true,
})));
const stop = () => {
  const timer = setTimeout(() => process.exit(1), 8000); timer.unref();
  server.drain().then(() => render.close()).then(() => { clearTimeout(timer); process.exit(0); });
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
