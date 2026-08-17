import PDFDocument = require('pdfkit');
import * as path from 'path';

/**
 * Real PDF fixtures for the Gmail attachment-filter tests. Built with pdfkit
 * (already a production dependency) so the tests exercise the actual
 * pdf-parse/pdf.js text extraction rather than a stub of it.
 */

/** The repo's Hebrew-capable font — needed for a PDF with real Hebrew text. */
const HEBREW_FONT = path.join(
  process.cwd(),
  'assets',
  'fonts',
  'Simpler-Regular.otf',
);

/**
 * The reader rejects PDFs under MIN_PDF_BYTES (20 KB) before ever looking at
 * their text, so fixtures have to clear that bar. Padding goes into the Info
 * dictionary: it inflates the file without adding page text that could
 * accidentally match a keyword.
 */
const PADDING_CHARS = 25_000;

function render(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.info.Subject = 'x'.repeat(PADDING_CHARS);
    build(doc);
    doc.end();
  });
}

/** A text-based PDF whose first page contains `text` (Latin script). */
export function latinTextPdf(text: string): Promise<Buffer> {
  return render((doc) => doc.fontSize(14).text(text));
}

/** A text-based PDF whose first page contains `text` in Hebrew. */
export function hebrewTextPdf(text: string): Promise<Buffer> {
  return render((doc) => {
    doc.registerFont('he', HEBREW_FONT);
    doc.font('he').fontSize(14).text(text);
  });
}

/**
 * A structurally valid PDF with no text layer at all — what a scanned or
 * photographed receipt looks like to a text extractor.
 */
export function scannedPdf(): Promise<Buffer> {
  return render(() => undefined);
}

/**
 * A PDF that starts with a correct %PDF- header (so it passes the reader's
 * technical checks) but whose body is garbage — the parser must fail on it.
 */
export function malformedPdf(): Buffer {
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    Buffer.alloc(30 * 1024, 0x41),
    Buffer.from('\n%%EOF\n'),
  ]);
}
