import { extractPdfText } from './pdf-text-extraction.util';
const parser = jest.fn();
jest.mock('../../protected-pdf/pdf-parser-process', () => ({
  runIsolatedPdfParser: (...args: unknown[]) => parser(...args),
}));
describe('PDF opening versus permissions', () => {
  beforeEach(() => parser.mockReset());
  it('distinguishes an opening password from a broken PDF', async () => {
    parser.mockResolvedValueOnce({ kind: 'password_required' });
    expect((await extractPdfText(Buffer.from('fixture'))).outcome).toBe(
      'PASSWORD_REQUIRED',
    );
    parser.mockResolvedValueOnce({ kind: 'invalid' });
    expect((await extractPdfText(Buffer.from('fixture'))).outcome).toBe(
      'FAILED',
    );
  });
  it('does not classify readable permission restrictions as password-required', async () => {
    parser.mockResolvedValue({ kind: 'text', text: 'Receipt', pages: 1 });
    expect(await extractPdfText(Buffer.from('fixture'))).toMatchObject({
      outcome: 'EXTRACTED',
      text: 'Receipt',
      pages: 1,
    });
  });
});
