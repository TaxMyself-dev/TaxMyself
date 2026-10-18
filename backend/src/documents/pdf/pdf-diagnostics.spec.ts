import { EventEmitter } from 'events';
import { createPdfTimings, measurePdfStage, pdfDiagnosticRequestId, pdfDiagnosticsMiddleware } from './pdf-diagnostics';

describe('development PDF request diagnostics', () => {
  const env = process.env.NODE_ENV;
  const file = process.env.PDF_DIAGNOSTICS_FILE;
  let logs: jest.SpyInstance;
  beforeEach(() => {
    process.env.NODE_ENV = 'development'; delete process.env.PDF_DIAGNOSTICS_FILE;
    logs = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    logs.mockRestore();
    if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
    if (file === undefined) delete process.env.PDF_DIAGNOSTICS_FILE; else process.env.PDF_DIAGNOSTICS_FILE = file;
  });
  const response = () => Object.assign(new EventEmitter(), {setHeader: jest.fn(), statusCode: 200});
  it('correlates middleware, stages and totals without recording request data', async () => {
    const res = response(); let id: string;
    await new Promise<void>((resolve, reject) => {
      pdfDiagnosticsMiddleware({method: 'POST', path: '/documents/create-doc', body: {secret: 'private'}}, res, () => {
        (async () => {
          id = pdfDiagnosticRequestId();
          const timer = createPdfTimings('pdf_create_stages');
          expect(await measurePdfStage('SIGN', async () => 'private-result', 'render-123')).toBe('private-result');
          timer.mark('SAVE'); timer.finish(); res.emit('finish'); resolve();
        })().catch(reject);
      });
    });
    const records = logs.mock.calls.map(([line]) => JSON.parse(line));
    expect(records).toHaveLength(4);
    expect(records.every(record => record.requestId === id)).toBe(true);
    expect(records[1]).toEqual(expect.objectContaining({stage: 'SIGN', success: true, renderRequestId: 'render-123'}));
    expect(res.setHeader).toHaveBeenCalledWith('X-Pdf-Diagnostic-Id', id);
    expect(JSON.stringify(records)).not.toContain('private');
    expect(pdfDiagnosticRequestId()).toBeUndefined();
  });
  it('preserves stage errors and logs no error details', async () => {
    const error = new Error('secret upstream payload');
    await expect(measurePdfStage('SIGN', async () => {throw error;})).rejects.toBe(error);
    expect(JSON.parse(logs.mock.calls[0][0]).success).toBe(false);
    expect(JSON.stringify(logs.mock.calls)).not.toContain('secret');
  });
  it('stays silent in production and on unrelated routes', async () => {
    const res = response(), next = jest.fn();
    process.env.NODE_ENV = 'production';
    pdfDiagnosticsMiddleware({method:'POST',path:'/documents/create-doc'},res,next);
    expect(await measurePdfStage('SIGN', async () => 7)).toBe(7);
    const timer = createPdfTimings('pdf_create_stages'); timer.mark('SAVE'); timer.finish();
    process.env.NODE_ENV = 'development';
    pdfDiagnosticsMiddleware({method:'GET',path:'/documents/get-docs'},res,next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.setHeader).not.toHaveBeenCalled(); expect(logs).not.toHaveBeenCalled();
  });
});
