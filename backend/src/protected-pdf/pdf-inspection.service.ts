import { Injectable } from '@nestjs/common';

export type PdfInspection =
  | { kind: 'readable'; pages: number }
  | { kind: 'password_required' | 'invalid' | 'limit' };
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 100;

@Injectable()
export class PdfInspectionService {
  async inspect(bytes: Buffer): Promise<PdfInspection> {
    if (!bytes?.length || bytes.subarray(0, 5).toString() !== '%PDF-')
      return { kind: 'invalid' };
    if (bytes.length > MAX_BYTES) return { kind: 'limit' };
    let task: any, document: any, timer: NodeJS.Timeout;
    try {
      const pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
      task = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        stopAtErrors: true,
        isEvalSupported: false,
      });
      const work = (async (): Promise<PdfInspection> => {
        document = await (task.promise || task);
        if (!Number.isInteger(document.numPages) || document.numPages < 1)
          return { kind: 'invalid' };
        if (document.numPages > MAX_PAGES) return { kind: 'limit' };
        // Validate every page's drawing operators, not just the first page's text.
        for (let page = 1; page <= document.numPages; page++) {
          const current = await document.getPage(page);
          await current.getOperatorList();
          current.cleanup?.();
        }
        return { kind: 'readable', pages: document.numPages };
      })();
      work.catch(() => undefined);
      return await Promise.race([
        work,
        new Promise<PdfInspection>((resolve) => {
          timer = setTimeout(() => resolve({ kind: 'limit' }), 15000);
        }),
      ]);
    } catch (error: any) {
      return {
        kind:
          error?.name === 'PasswordException' ? 'password_required' : 'invalid',
      };
    } finally {
      clearTimeout(timer);
      // Best effort destruction; parser errors/URLs/document text never leave this boundary.
      let cleanupTimer: NodeJS.Timeout;
      const cleanup = Promise.resolve()
        .then(() => task?.destroy?.() || document?.destroy?.())
        .catch(() => undefined);
      await Promise.race([
        cleanup,
        new Promise<void>((resolve) => {
          cleanupTimer = setTimeout(resolve, 2000);
        }),
      ]);
      clearTimeout(cleanupTimer);
    }
  }
}
