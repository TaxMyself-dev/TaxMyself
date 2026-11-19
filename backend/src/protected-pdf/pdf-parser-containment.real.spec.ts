import * as cp from 'child_process';
import { createServer, get } from 'http';
import { AddressInfo } from 'net';
import { readFileSync } from 'fs';
import { join } from 'path';
import PDFDocument = require('pdfkit');
import { PdfInspectionService } from './pdf-inspection.service';
import { runIsolatedPdfParser } from './pdf-parser-process';
import { hebrewTextPdf, malformedPdf } from '../../test/fixtures/pdf-fixtures';
jest.setTimeout(30000);
afterEach(() => jest.restoreAllMocks());
function overrideProgram(program: (source: string) => string) {
  const real = cp.spawn;
  jest.spyOn(cp, 'spawn').mockImplementationOnce(((
    file: any,
    args: any[],
    options: any,
  ) => {
    const changed = [...args],
      index = changed.indexOf('-e') + 1;
    changed[index] = program(changed[index]);
    return real(file, changed, options);
  }) as any);
}
it('reads embedded fonts without a browser and remains usable after a broken file', async () => {
  const service = new PdfInspectionService();
  const bytes = await hebrewTextPdf('בדיקת גופן מלאכותית');
  expect(await service.inspect(bytes)).toEqual({ kind: 'readable', pages: 1 });
  expect(await service.inspect(malformedPdf())).toEqual({ kind: 'invalid' });
  expect(await service.inspect(bytes)).toEqual({ kind: 'readable', pages: 1 });
});
it('keeps the host HTTP server alive after a real uncaught parser-process exception', async () => {
  const server = createServer((_req, res) => res.end('healthy'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    overrideProgram(
      () =>
        "process.send({kind:'readable',pages:1},()=>{setImmediate(()=>{throw new ReferenceError('document is not defined')})});process.stdin.resume();",
    );
    expect(
      await runIsolatedPdfParser(Buffer.from('%PDF-test'), 'inspect'),
    ).toEqual({ kind: 'invalid' });
    const status = await new Promise<number>((resolve, reject) =>
      get(
        'http://127.0.0.1:' + (server.address() as AddressInfo).port,
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      ).on('error', reject),
    );
    expect(status).toBe(200);
    expect(
      await new PdfInspectionService().inspect(
        readFileSync(
          join(__dirname, '../../test/fixtures/protected-pdf/open.pdf'),
        ),
      ),
    ).toEqual({ kind: 'readable', pages: 1 });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
it('checks every page and rejects damage on a later page', async () => {
  overrideProgram((source) =>
    source.replace(
      'const pdfjs = require(process.argv[1]);',
      "const pdfjs = {PDFJS:{}, getDocument:()=>({promise:Promise.resolve({numPages:2,getPage:async i=>{if(i===2)throw Error('broken later page');return {getOperatorList:async()=>({})}})})};",
    ),
  );
  expect(
    await runIsolatedPdfParser(Buffer.from('%PDF-test'), 'inspect'),
  ).toEqual({ kind: 'invalid' });
});
it('enforces the page limit without scanning 101 pages', async () => {
  const bytes = await new Promise<Buffer>((resolve) => {
    const d = new PDFDocument({ autoFirstPage: false }),
      chunks: Buffer[] = [];
    d.on('data', (c) => chunks.push(c));
    d.on('end', () => resolve(Buffer.concat(chunks)));
    for (let i = 0; i < 101; i++) d.addPage();
    d.end();
  });
  expect(await new PdfInspectionService().inspect(bytes)).toEqual({
    kind: 'limit',
  });
});
