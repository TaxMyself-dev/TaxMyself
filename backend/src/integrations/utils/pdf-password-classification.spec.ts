import { extractPdfText } from './pdf-text-extraction.util';
const parser = jest.fn();
jest.mock('pdf-parse/lib/pdf-parse.js', () => (...args: unknown[]) => parser(...args));
describe('PDF opening versus permissions', () => {
  beforeEach(() => parser.mockReset());
  it('reports an opening password separately from a broken PDF', async () => {
    parser.mockRejectedValueOnce(Object.assign(new Error('No password given'), { name: 'PasswordException', code: 1 }));
    expect((await extractPdfText(Buffer.from('fixture'))).outcome).toBe('PASSWORD_REQUIRED');
    parser.mockRejectedValueOnce(new Error('Invalid PDF structure'));
    expect((await extractPdfText(Buffer.from('fixture'))).outcome).toBe('FAILED');
  });
  it('does not classify a readable permissions-restricted document as password-required', async () => {
    parser.mockResolvedValue({ text: 'Receipt', numpages: 1 });
    expect(await extractPdfText(Buffer.from('fixture'))).toMatchObject({ outcome: 'EXTRACTED', text: 'Receipt', pages: 1 });
  });
});
