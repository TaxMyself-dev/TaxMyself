import { Logger } from '@nestjs/common';
import { runIsolatedPdfParser } from '../../protected-pdf/pdf-parser-process';
export type PdfTextExtractionOutcome =
  | 'EXTRACTED'
  | 'NO_TEXT'
  | 'PASSWORD_REQUIRED'
  | 'TOO_LARGE'
  | 'FAILED'
  | 'UNAVAILABLE';
export interface PdfTextExtractionResult {
  outcome: PdfTextExtractionOutcome;
  text: string;
  error?: string;
  pages?: number;
}
/** Local text only, first 3 pages/20k chars; never OCR, persistence, or AI. */
export async function extractPdfText(
  content: Buffer,
  _logger?: Logger,
): Promise<PdfTextExtractionResult> {
  if (!content?.length)
    return { outcome: 'FAILED', text: '', error: 'empty buffer' };
  if (content.length > 15 * 1024 * 1024)
    return { outcome: 'TOO_LARGE', text: '' };
  const result = await runIsolatedPdfParser(content, 'text', 10000);
  if (result.kind === 'text')
    return {
      outcome: result.text.trim() ? 'EXTRACTED' : 'NO_TEXT',
      text: result.text.trim() ? result.text : '',
      pages: result.pages,
    };
  if (result.kind === 'password_required')
    return {
      outcome: 'PASSWORD_REQUIRED',
      text: '',
      error: 'password required',
    };
  if (result.kind === 'unavailable')
    return {
      outcome: 'UNAVAILABLE',
      text: '',
      error: 'PDF parser unavailable',
    };
  return {
    outcome: 'FAILED',
    text: '',
    error:
      result.kind === 'limit'
        ? 'PDF parser limit exceeded'
        : 'PDF parser failed',
  };
}
