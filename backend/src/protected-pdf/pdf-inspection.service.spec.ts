import { PdfInspectionService } from './pdf-inspection.service';
import { runIsolatedPdfParser } from './pdf-parser-process';
jest.mock('./pdf-parser-process', () => ({ runIsolatedPdfParser: jest.fn() }));
const parse = runIsolatedPdfParser as jest.Mock;
describe('PDF inspection boundary', () => {
  beforeEach(() => parse.mockReset());
  it.each(['password_required', 'invalid', 'limit', 'readable'])(
    'preserves %s independently',
    async (kind) => {
      const result = kind === 'readable' ? { kind, pages: 2 } : { kind };
      parse.mockResolvedValue(result);
      expect(
        await new PdfInspectionService().inspect(Buffer.from('%PDF-fixture')),
      ).toEqual(result);
    },
  );
  it('rejects headers and excessive bytes before starting a parser', async () => {
    const service = new PdfInspectionService();
    expect(await service.inspect(Buffer.from('not PDF'))).toEqual({
      kind: 'invalid',
    });
    const large = Buffer.alloc(11 * 1024 * 1024);
    large.write('%PDF-');
    expect(await service.inspect(large)).toEqual({ kind: 'limit' });
    expect(parse).not.toHaveBeenCalled();
  });
  it('does not mistake an unavailable process for a password or readable PDF', async () => {
    parse.mockResolvedValue({ kind: 'unavailable' });
    expect(
      await new PdfInspectionService().inspect(Buffer.from('%PDF-fixture')),
    ).toEqual({ kind: 'invalid' });
  });
});
