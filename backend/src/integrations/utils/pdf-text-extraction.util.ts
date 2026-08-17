import { Logger } from '@nestjs/common';

/**
 * Local, best-effort text extraction from text-based PDFs. Used by the Gmail
 * intake filter as a LAST resort: only for PDFs whose filename/subject/body
 * carried no accounting-document keyword, and only after the deterministic
 * technical checks (extension, size, %PDF- header, inline-asset) already
 * passed on the buffer that was downloaded anyway.
 *
 * Deliberately narrow: no OCR, no image handling, no persistence. A PDF that
 * is scanned, encrypted, malformed or simply expensive to parse yields an
 * outcome — never an exception — so one bad attachment cannot abort an import.
 */

/**
 * Above this the PDF is not worth scanning for a keyword: parsing cost and
 * memory grow with the file, and huge attachments are rarely the plain
 * text-based invoices this check exists for.
 */
const MAX_PDF_BYTES_FOR_TEXT = 15 * 1024 * 1024;

/**
 * Invoices and receipts name themselves on the first page. Parsing three is
 * generous and bounds the cost of a 500-page statement.
 */
const MAX_PAGES_TO_PARSE = 3;

/** Keyword matching needs a page or two of text, not a whole document. */
const MAX_TEXT_CHARS = 20_000;

/** Hard stop for pathological PDFs that parse slowly instead of failing. */
const EXTRACTION_TIMEOUT_MS = 10_000;

export type PdfTextExtractionOutcome =
  /** Text was extracted and is available for matching. */
  | 'EXTRACTED'
  /** Parsed fine but has no text layer — a scan/photo. OCR is out of scope. */
  | 'NO_TEXT'
  /** Skipped before parsing: over MAX_PDF_BYTES_FOR_TEXT. */
  | 'TOO_LARGE'
  /** Malformed, encrypted, or slower than EXTRACTION_TIMEOUT_MS. */
  | 'FAILED'
  /** The parser module could not be loaded in this environment. */
  | 'UNAVAILABLE';

export interface PdfTextExtractionResult {
  outcome: PdfTextExtractionOutcome;
  /** Empty unless outcome is EXTRACTED. Never logged, never persisted. */
  text: string;
  /** Short failure label for logs — an error message, never document content. */
  error?: string;
}

type PdfParseFn = (
  data: Uint8Array,
  options?: { max?: number },
) => Promise<{ text?: string }>;

/** Cached module handle: undefined = not tried yet, null = unavailable. */
let cachedPdfParse: PdfParseFn | null | undefined;

/**
 * Loads pdf-parse lazily so a Gmail run that never needs content matching does
 * not pay the (sizeable) pdf.js load, and so a broken install degrades to
 * UNAVAILABLE instead of crashing the module graph at boot.
 *
 * The `lib/pdf-parse.js` entry point is deliberate: the package's index.js
 * runs a self-test that reads a bundled fixture from disk when it thinks it is
 * the main module.
 */
function loadPdfParse(logger?: Logger): PdfParseFn | null {
  if (cachedPdfParse !== undefined) return cachedPdfParse;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cachedPdfParse = require('pdf-parse/lib/pdf-parse.js') as PdfParseFn;
  } catch (error: any) {
    cachedPdfParse = null;
    logger?.warn(`PDF text extraction unavailable: ${error?.message ?? error}`);
  }
  return cachedPdfParse;
}

/**
 * Extracts up to MAX_TEXT_CHARS of text from the first MAX_PAGES_TO_PARSE
 * pages of `content`. Never throws.
 */
export async function extractPdfText(
  content: Buffer,
  logger?: Logger,
): Promise<PdfTextExtractionResult> {
  if (!content?.length) {
    return { outcome: 'FAILED', text: '', error: 'empty buffer' };
  }
  if (content.length > MAX_PDF_BYTES_FOR_TEXT) {
    return { outcome: 'TOO_LARGE', text: '' };
  }

  const pdfParse = loadPdfParse(logger);
  if (!pdfParse) {
    return { outcome: 'UNAVAILABLE', text: '' };
  }

  try {
    // pdf.js (bundled by pdf-parse) reads the underlying ArrayBuffer from
    // offset 0, so a Buffer that is a view into Node's shared pool would be
    // parsed as garbage. Copy only in that case.
    const bytes =
      content.byteOffset === 0 &&
      content.byteLength === content.buffer.byteLength
        ? content
        : new Uint8Array(content);

    const parsed = await withTimeout(
      pdfParse(bytes, { max: MAX_PAGES_TO_PARSE }),
      EXTRACTION_TIMEOUT_MS,
    );
    const text = (parsed?.text ?? '').slice(0, MAX_TEXT_CHARS);
    if (!text.trim()) {
      return { outcome: 'NO_TEXT', text: '' };
    }
    return { outcome: 'EXTRACTED', text };
  } catch (error: any) {
    // Encrypted, truncated, structurally broken or too slow — all contained
    // here. Only the error message is surfaced, never any document content.
    return { outcome: 'FAILED', text: '', error: shortError(error) };
  }
}

/**
 * Rejects when `promise` outlives `ms`. The underlying parse cannot be
 * cancelled, but its result (and any late rejection) is dropped.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`pdf text extraction timed out after ${ms}ms`)),
      ms,
    );
  });
  // A late rejection from the loser must not surface as an unhandled rejection.
  promise.catch(() => undefined);
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** One short line, safe to log — no stack, no document text. */
function shortError(error: any): string {
  const message = String(error?.message ?? error ?? 'unknown error');
  return message.length > 120 ? `${message.slice(0, 120)}…` : message;
}
