// Runs the actual HTTP server and actual browser, without DB/provider credentials.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const output =
  process.argv[3] ||
  path.join(require("node:os").tmpdir(), "pdf-service-artifacts");
fs.mkdirSync(output, { recursive: true });
let child, localServer;
const port = process.argv[2] ? 8082 : 8080;
const url = "http://127.0.0.1:" + port;
if (process.argv[2]) {
  const { createRenderer } = require("../src/renderer.cjs");
  const { createServer } = require("../src/server.cjs");
  localServer = createServer({
    render: createRenderer({
      puppeteer: require("puppeteer-core"),
      template: require("../dist/document-pdf.template.js"),
      executablePath: process.argv[2],
      fontDirectory: path.resolve("../backend/src/assets/document-fonts"),
    }),
  });
  localServer.listen(port, "127.0.0.1");
} else
  child = spawn(process.execPath, ["src/server.cjs"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "inherit",
  });
const report = { node: process.version, documents: [] };
const stop = setTimeout(() => {
  child?.kill("SIGKILL");
  localServer?.closeAllConnections();
  process.exit(1);
}, 180000);
(async () => {
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    try {
      healthy = (await fetch(url + "/healthz")).ok;
    } catch {}
    if (healthy) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!healthy) throw Error("Service did not start");
  // Synthetic raster logo, no personal data and no network resources.
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, data) => {
    const type = Buffer.from(name),
      size = Buffer.alloc(4),
      check = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    check.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(100, 0);
  header.writeUInt32BE(100, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(100 * 301);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) {
      const p = y * 301 + 1 + x * 3;
      pixels[p] = 102;
      pixels[p + 1] = 185;
      pixels[p + 2] = 156;
    }
  const png = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", require("node:zlib").deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const logo = "data:image/png;base64," + png.toString("base64");
  const cases = process.env.PDF_DIAGNOSTIC_PAIRS === "1"
    ? Array.from({ length: 3 }, (_, i) => [[`receipt-logo-${i + 1}`, 3, true], [`receipt-no-logo-${i + 1}`, 3, false]]).flat()
    : [
    ["receipt-logo", 3, true],
    ["receipt-no-logo", 3, false],
    ["invoice-multipage", 55, true],
    ["large-amounts", 2, false],
  ];
  for (const [name, rows, hasLogo] of cases) {
    const amount = name === "large-amounts" ? "₪1,234,567,890,123.45" : "₪67";
    const document = {
      title: rows === 55 ? "חשבונית מס מספר 20000" : "קבלה מספר 10000000",
      issuerName: "עסק לדוגמה",
      issuerDetails: "ירושלים\n050-0000000",
      recipientName: "לקוח לדוגמה",
      recipientTaxNumber: "מספר עוסק: 222222222",
      documentType: "מקור",
      date: "15-10-2026",
      subtitle: "קבלה עבור חשבון עסקה 112233",
      preview: rows !== 55,
      items: Array.from({ length: rows }, (_, i) => ({
        פירוט: "פריט " + (i + 1) + " — תיאור ארוך לבדיקת גלישת שורות בעברית",
        כמות: "1.00",
        מחיר: amount,
        'סה"כ': amount,
      })),
      payments: [],
      paymentTotals: [],
      totals: [{ תיאור: "סה״כ", סכום: "₪" + rows * 67 }],
      ...(hasLogo ? { logoDataUri: logo } : {}),
    };
    if (name === "large-amounts") {
      document.totals = [
        { תיאור: "סה״כ לפני הנחה:", סכום: amount },
        { תיאור: "הנחה:", סכום: "₪5,676.00" },
        { תיאור: "סה״כ:", סכום: amount },
      ];
      document.payments = [
        {
          "אמצעי תשלום": "העברה בנקאית",
          פירוט: "פירוט תשלום ארוך לבדיקת גלישת טקסט בלי לפגוע ברוחב הסכום",
          תאריך: "16-10-2026",
          סכום: amount,
        },
      ];
      document.paymentTotals = [{ תיאור: "סה״כ", סכום: amount }];
    }
    const start = Date.now();
    const response = await fetch(url + "/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: 1, requestId: name, document }),
    });
    if (!response.ok)
      throw Error(
        "HTTP smoke failed: " + response.status + " " + (await response.text())
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw Error("Invalid PDF");
    fs.writeFileSync(path.join(output, name + ".pdf"), bytes);
    report.documents.push({
      name,
      bytes: bytes.length,
      elapsedMs: Date.now() - start,
    });
    console.log(
      "PDF_HTTP_SMOKE_PASS " + JSON.stringify(report.documents.at(-1))
    );
  }
  fs.writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2)
  );
  if (process.env.PDF_DIAGNOSTIC_PAIRS !== "1") await require("./check-layout.cjs").verifyLayout({
    executablePath: process.argv[2] || "/usr/bin/chromium",
    fontDirectory: process.argv[2]
      ? path.resolve("../backend/src/assets/document-fonts")
      : path.resolve("fonts"),
    template: require("../dist/document-pdf.template.js"),
  });
})()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(stop);
    child?.kill("SIGTERM");
    localServer?.close();
  });
