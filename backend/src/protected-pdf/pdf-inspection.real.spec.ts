import { readFileSync } from 'fs';
import { join } from 'path';
import { PdfInspectionService } from './pdf-inspection.service';
import { malformedPdf } from '../../test/fixtures/pdf-fixtures';
describe('Real synthetic protected PDFs (local parser only)', () => {
  const validator = new PdfInspectionService();
  const fixture = (name: string) =>
    readFileSync(join(__dirname, '../../test/fixtures/protected-pdf', name));
  it('distinguishes a user-password PDF from a readable permissions-only PDF', async () => {
    expect(await validator.inspect(fixture('password-required.pdf'))).toEqual({
      kind: 'password_required',
    });
    expect(await validator.inspect(fixture('permissions-only.pdf'))).toEqual({
      kind: 'readable',
      pages: 1,
    });
    expect(await validator.inspect(fixture('open.pdf'))).toEqual({
      kind: 'readable',
      pages: 1,
    });
  });
  it('classifies a malformed PDF independently', async () => {
    expect(await validator.inspect(malformedPdf())).toEqual({
      kind: 'invalid',
    });
  });

  it('supports AES-256 opening passwords and readable permissions-only encryption', async () => {
    expect(await validator.inspect(fixture('password-required-aes256.pdf'))).toEqual({kind:'password_required'});
    expect(await validator.inspect(fixture('permissions-only-aes256.pdf'))).toEqual({kind:'readable',pages:1});
  });
});
