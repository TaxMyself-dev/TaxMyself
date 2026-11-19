import { PdfInspectionService } from './pdf-inspection.service';
const load = jest.fn();
jest.mock('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js', () => ({
  getDocument: (...args: any[]) => load(...args),
}));
describe('Bounded PDF structural validation', () => {
  const validator = new PdfInspectionService();
  beforeEach(() => load.mockReset());
  it('distinguishes opening password, damage and readable permission restrictions', async () => {
    load.mockReturnValueOnce({
      promise: Promise.reject(
        Object.assign(new Error('secret details'), {
          name: 'PasswordException',
        }),
      ),
      destroy: jest.fn(),
    });
    expect(await validator.inspect(Buffer.from('%PDF-fixture'))).toEqual({
      kind: 'password_required',
    });
    load.mockReturnValueOnce({
      promise: Promise.reject(new Error('bad structure')),
      destroy: jest.fn(),
    });
    expect(await validator.inspect(Buffer.from('%PDF-fixture'))).toEqual({
      kind: 'invalid',
    });
    const operators = jest.fn().mockResolvedValue({});
    load.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 2,
        getPage: jest
          .fn()
          .mockResolvedValue({
            getOperatorList: operators,
            cleanup: jest.fn(),
          }),
      }),
      destroy: jest.fn(),
    });
    expect(await validator.inspect(Buffer.from('%PDF-fixture'))).toEqual({
      kind: 'readable',
      pages: 2,
    });
    expect(operators).toHaveBeenCalledTimes(2);
  });
  it('validates later pages, not just an accessible first page', async () => {
    load.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: jest
          .fn()
          .mockResolvedValueOnce({
            getOperatorList: jest.fn().mockResolvedValue({}),
          })
          .mockRejectedValueOnce(new Error('second page broken')),
      }),
      destroy: jest.fn(),
    });
    expect(await validator.inspect(Buffer.from('%PDF-fixture'))).toEqual({
      kind: 'invalid',
    });
  });
  it('rejects non-PDF, oversized and over-page-limit uploads before AI', async () => {
    expect(await validator.inspect(Buffer.from('not pdf'))).toEqual({
      kind: 'invalid',
    });
    const large = Buffer.alloc(11 * 1024 * 1024);
    large.write('%PDF-');
    expect(await validator.inspect(large)).toEqual({ kind: 'limit' });
    expect(load).not.toHaveBeenCalled();
    load.mockReturnValue({
      promise: Promise.resolve({ numPages: 101 }),
      destroy: jest.fn(),
    });
    expect(await validator.inspect(Buffer.from('%PDF-fixture'))).toEqual({
      kind: 'limit',
    });
  });
  it('bounds a hanging parser and destroys its loading task', async () => {
    jest.useFakeTimers();
    try {
      const destroy = jest.fn().mockResolvedValue(undefined);
      load.mockReturnValue({ promise: new Promise(() => undefined), destroy });
      const pending = validator.inspect(Buffer.from('%PDF-fixture'));
      await jest.advanceTimersByTimeAsync(15001);
      expect(await pending).toEqual({ kind: 'limit' });
      expect(destroy).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
