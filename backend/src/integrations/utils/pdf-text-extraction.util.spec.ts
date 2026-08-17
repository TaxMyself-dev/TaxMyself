import {
  hebrewTextPdf,
  latinTextPdf,
  malformedPdf,
  scannedPdf,
} from '../../../test/fixtures/pdf-fixtures';
import { extractPdfText } from './pdf-text-extraction.util';

// pdf.js parsing of a real (padded) PDF is slower than the 5s jest default.
jest.setTimeout(30_000);

describe('extractPdfText', () => {
  it('extracts Latin text from a text-based PDF', async () => {
    const result = await extractPdfText(
      await latinTextPdf('Tax Invoice 12345'),
    );

    expect(result.outcome).toBe('EXTRACTED');
    expect(result.text).toContain('Tax Invoice 12345');
  });

  it('extracts Hebrew text from a text-based PDF', async () => {
    const result = await extractPdfText(
      await hebrewTextPdf('חשבונית מס/קבלה 4432'),
    );

    expect(result.outcome).toBe('EXTRACTED');
    expect(result.text).toContain('חשבונית');
  });

  it('reports NO_TEXT for a PDF without a text layer (scan/photo)', async () => {
    const result = await extractPdfText(await scannedPdf());

    expect(result.outcome).toBe('NO_TEXT');
    expect(result.text).toBe('');
  });

  it('reports FAILED for a malformed PDF instead of throwing', async () => {
    const result = await extractPdfText(malformedPdf());

    expect(result.outcome).toBe('FAILED');
    expect(result.text).toBe('');
    expect(typeof result.error).toBe('string');
  });

  it('reports FAILED for an empty buffer', async () => {
    const result = await extractPdfText(Buffer.alloc(0));

    expect(result.outcome).toBe('FAILED');
  });

  it('skips oversized PDFs before parsing them', async () => {
    // 16 MB — above MAX_PDF_BYTES_FOR_TEXT, so it is never handed to the parser.
    const result = await extractPdfText(Buffer.alloc(16 * 1024 * 1024, 0x41));

    expect(result.outcome).toBe('TOO_LARGE');
    expect(result.text).toBe('');
  });

  it('never returns extracted text alongside a non-EXTRACTED outcome', async () => {
    const results = await Promise.all([
      extractPdfText(await scannedPdf()),
      extractPdfText(malformedPdf()),
      extractPdfText(Buffer.alloc(16 * 1024 * 1024, 0x41)),
    ]);

    for (const result of results) {
      expect(result.text).toBe('');
    }
  });
});
