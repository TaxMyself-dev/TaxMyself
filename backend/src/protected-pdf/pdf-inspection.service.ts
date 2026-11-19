import { Injectable } from '@nestjs/common';
import { runIsolatedPdfParser } from './pdf-parser-process';

export type PdfInspection =
  | { kind: 'readable'; pages: number }
  | { kind: 'password_required' | 'invalid' | 'limit' };
const MAX_BYTES = 10 * 1024 * 1024;

@Injectable()
export class PdfInspectionService {
  async inspect(bytes: Buffer): Promise<PdfInspection> {
    if (!bytes?.length || bytes.subarray(0, 5).toString() !== '%PDF-')
      return { kind: 'invalid' };
    if (bytes.length > MAX_BYTES) return { kind: 'limit' };
    const result = await runIsolatedPdfParser(bytes, 'inspect');
    if (result.kind === 'readable') return result;
    if (result.kind === 'password_required' || result.kind === 'limit')
      return { kind: result.kind };
    return { kind: 'invalid' };
  }
}
