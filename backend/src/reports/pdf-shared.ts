import * as path from 'path';
import * as fs from 'fs';

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'Simpler-Regular.otf');
const FONT_BOLD = path.join(FONT_DIR, 'Simpler-Bold.otf');

/** Compliance footer required on every generated PDF page. */
export const PDF_COMPLIANCE_FOOTER = 'Created by KeepInTax LTD | תוכנה מאושרת על ידי רשות המיסים';

const HEBREW_RE = /[֐-׿]/;

/**
 * Draws a line of RTL/Hebrew (optionally mixed with LTR/digit/English)
 * text at an exact position, laid out correctly for a right-to-left
 * reading paragraph.
 *
 * Why this exists: pdfkit's font shaper (fontkit) DOES correctly reverse a
 * single space-free run of Hebrew characters into left-to-right-drawable
 * glyph order (so one Hebrew word on its own renders fine). But PDFKit's
 * own `EmbeddedFont.layout()` splits text into chunks on literal space/tab
 * BEFORE shaping (to cache per-word widths), attaching each chunk's
 * trailing space to itself and shaping chunks independently. That loses
 * inter-word spacing and never reorders the words themselves — so any
 * multi-word Hebrew string fed straight to `doc.text()` comes out with
 * words in the wrong order and spaces missing/misplaced between them.
 *
 * The fix: bypass pdfkit's own space handling. Split the string into
 * whitespace-separated tokens ourselves, group them into runs of
 * consecutive Hebrew vs. non-Hebrew tokens, determine the paragraph's base
 * direction from its first run, and lay out the runs accordingly:
 *   - RTL-base paragraph (starts with Hebrew, e.g. any of our normal
 *     labels): run order reverses (later logical runs sit further left);
 *     digit/Latin runs embedded inside keep their own left-to-right order.
 *   - LTR-base paragraph (e.g. the "Created by KeepInTax LTD | <hebrew>"
 *     compliance footer): run order is kept as typed; only the words
 *     *within* a Hebrew run get reordered (an embedded RTL run inside an
 *     LTR line).
 * Each resulting token is then measured and drawn as its own `doc.text()`
 * call at a manually computed x — pdfkit never sees a literal space next
 * to Hebrew text, so its buggy chunk-reversal never triggers.
 */
export function drawRtl(
  doc: any,
  text: string,
  x: number,
  y: number,
  width: number,
  opts: { align?: 'right' | 'left' | 'center' } = {},
): void {
  const words = text.split(' ').filter((w) => w.length > 0);
  if (words.length === 0) return;
  if (words.length === 1) {
    doc.text(text, x, y, { width, align: opts.align ?? 'right', lineBreak: false });
    return;
  }

  const runs: { hebrew: boolean; tokens: string[] }[] = [];
  for (const t of words) {
    const isHebrew = HEBREW_RE.test(t);
    const last = runs[runs.length - 1];
    if (last && last.hebrew === isHebrew) {
      last.tokens.push(t);
    } else {
      runs.push({ hebrew: isHebrew, tokens: [t] });
    }
  }

  // The draw loop below fills right-to-left (finalTokens[0] lands at the
  // rightmost slot). A run-to-right-to-left mapping needs:
  //   - RTL-base paragraph (starts with Hebrew): the words' own typed
  //     order already reads correctly right-to-left when fed straight
  //     into that loop — no reordering at all, of runs or tokens.
  //   - LTR-base paragraph (e.g. an English prefix before an embedded
  //     Hebrew phrase): later runs sit further right, so run order
  //     reverses; a Hebrew run's own tokens still read correctly in
  //     their typed order, but a non-Hebrew run's tokens must reverse
  //     so the fill-right-to-left loop lays them out left-to-right.
  const baseRtl = runs[0].hebrew;
  const finalTokens: string[] = [];
  if (baseRtl) {
    for (const run of runs) finalTokens.push(...run.tokens);
  } else {
    for (const run of [...runs].reverse()) {
      finalTokens.push(...(run.hebrew ? run.tokens : [...run.tokens].reverse()));
    }
  }

  const spaceWidth = doc.widthOfString(' ');
  const tokenWidths = finalTokens.map((t) => doc.widthOfString(t));
  const totalWidth = tokenWidths.reduce((s, w) => s + w, 0) + spaceWidth * (finalTokens.length - 1);

  const align = opts.align ?? 'right';
  let startRight: number;
  if (align === 'left') startRight = x + totalWidth;
  else if (align === 'center') startRight = x + (width + totalWidth) / 2;
  else startRight = x + width;

  let cursorRight = startRight;
  for (let i = 0; i < finalTokens.length; i++) {
    const w = tokenWidths[i];
    const tokenX = cursorRight - w;
    doc.text(finalTokens[i], tokenX, y, { lineBreak: false });
    cursorRight = tokenX - spaceWidth;
  }
}

export const fmtMoney = (n: number): string =>
  `₪ ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

export const fmtDate = (d: Date): string => {
  const dt = new Date(d);
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getUTCFullYear()}`;
};

/** Registers the Hebrew fonts on the document (falls back to Helvetica if missing). */
export function registerHebrewFonts(doc: any): { fontR: string; fontB: string } {
  const hasFonts = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);
  if (hasFonts) {
    doc.registerFont('he', FONT_REGULAR);
    doc.registerFont('he-bold', FONT_BOLD);
  }
  return { fontR: hasFonts ? 'he' : 'Helvetica', fontB: hasFonts ? 'he-bold' : 'Helvetica-Bold' };
}

/**
 * Stamps the KeepInTax compliance footer on every buffered page. Call once,
 * right before `doc.end()`, on a PDFDocument created with `{ bufferPages: true }`.
 *
 * The y position is kept ABOVE `page.height - margins.bottom` (not below
 * it) — pdfkit treats any explicit y past that boundary as "doesn't fit"
 * and silently calls `addPage()` before drawing, which produced a spurious
 * near-blank extra page when this used to sit a few points past the margin.
 */
export function stampFooterOnAllPages(doc: any, fontR: string): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.width - doc.page.margins.right;
    const contentWidth = pageRight - pageLeft;
    const y = doc.page.height - doc.page.margins.bottom - 20;
    doc.font(fontR).fontSize(9).fillColor('#888888');
    drawRtl(doc, PDF_COMPLIANCE_FOOTER, pageLeft, y, contentWidth, { align: 'center' });
  }
}
