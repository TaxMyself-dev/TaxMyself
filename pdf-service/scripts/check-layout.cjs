const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
async function verifyLayout({ executablePath, fontDirectory, template }) {
  const fonts = template.fontCss(
    fs
      .readFileSync(path.join(fontDirectory, "Simpler-Regular.otf"))
      .toString("base64"),
    fs
      .readFileSync(path.join(fontDirectory, "Simpler-Bold.otf"))
      .toString("base64")
  );
  const browser = await require("puppeteer-core").launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    timeout: 15000,
    protocolTimeout: 20000,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 680, height: 1000 });
    await page.emulateMediaType("print");
    for (const amount of [
      "₪4,565,465.00",
      "₪1,234,567,890,123.45",
      "-₪999,999,999.99",
    ]) {
      const model = {
        title: "בדיקת סכומים",
        documentType: "מקור",
        date: "16-10-2026",
        preview: true,
        items: [
          {
            פירוט:
              "תיאור ארוך שניתן לחלק לשורות לפי המקום שנותר לצד הסכומים הגדולים",
            כמות: "1.00",
            מחיר: amount,
            הנחה: "₪5,676.00",
            'סה"כ': amount,
          },
        ],
        totals: [
          { תיאור: "סה״כ לפני הנחה:", סכום: amount },
          { תיאור: "הנחה:", סכום: "₪5,676.00" },
          { תיאור: "סה״כ:", סכום: amount },
        ],
        payments: [
          {
            "אמצעי תשלום": "העברה בנקאית",
            פירוט: "פירוט תשלום ארוך שניתן לחלק לשורות בלי להצר את שדה הסכום",
            תאריך: "16-10-2026",
            סכום: amount,
          },
        ],
        paymentTotals: [{ תיאור: "סה״כ", סכום: amount }],
      };
      await page.setContent(template.buildDocumentHtml(model, fonts), {
        waitUntil: "load",
      });
      await page.evaluate(() => document.fonts.ready);
      const failures = await page.evaluate(() => {
        const failures = [];
        const lineCount = (element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getClientRects().length;
        };
        for (const heading of document.querySelectorAll("th"))
          if (lineCount(heading) > 1) failures.push("wrapped column heading");
        for (const cell of document.querySelectorAll("td.numeric")) {
          const text = cell.querySelector("bdi"),
            r = text.getBoundingClientRect(),
            box = cell.getBoundingClientRect(),
            style = getComputedStyle(cell);
          if (lineCount(text) > 1)
            failures.push("wrapped number: " + text.textContent);
          if (
            r.left < box.left + parseFloat(style.paddingLeft) - 1 ||
            r.right > box.right - parseFloat(style.paddingRight) + 1
          )
            failures.push("number outside cell: " + text.textContent);
        }
        for (const row of document.querySelectorAll(".total-row")) {
          const label = row.querySelector("span"),
            amount = row.querySelector("bdi");
          if (lineCount(label) > 1 || lineCount(amount) > 1)
            failures.push("wrapped summary");
          if (
            amount.getBoundingClientRect().right >
            label.getBoundingClientRect().left
          )
            failures.push("overlapping summary");
        }
        for (const table of document.querySelectorAll("table,.totals")) {
          const r = table.getBoundingClientRect();
          if (r.left < -1 || r.right > document.documentElement.clientWidth + 1)
            failures.push("outside printable width");
        }
        return failures;
      });
      assert.deepEqual(failures, [], amount);
      console.log("PDF_NUMERIC_LAYOUT_PASS " + amount);
    }
  } finally {
    await browser.close();
  }
}
module.exports = { verifyLayout };
