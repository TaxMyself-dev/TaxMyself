import axios from 'axios';
import {
  FillFasterSigner,
  hasCompletePdfSignature,
} from './fillfaster-signer.service';
jest.mock('axios');

// Synthetic envelope for structural checks only; deliberately not a trusted signature.
function envelope(): Buffer {
  const prefix = '%PDF-1.7\n/ByteRange [0 000100 000110 000010]\n';
  return Buffer.from(
    prefix.padEnd(100, ' ') + '<12345678>' + '%%EOF     ',
    'latin1',
  );
}
describe('FillFaster signer', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    jest.clearAllMocks();
  });
  it('requires configuration without making a request', async () => {
    delete process.env.FILLFASTER_API_TOKEN;
    delete process.env.FILLFASTER_BASE_PDF_FID;
    await expect(
      new FillFasterSigner().sign(Buffer.from('%PDF-')),
    ).rejects.toThrow('configuration');
    expect(axios.post).not.toHaveBeenCalled();
  });
  it('sends a prepared PDF and rejects unsigned provider output without exposing credentials', async () => {
    process.env.FILLFASTER_API_TOKEN = 'test-secret';
    process.env.FILLFASTER_BASE_PDF_FID = 'test-template';
    (axios.post as jest.Mock).mockResolvedValue({
      data: Buffer.from('%PDF-1.7 unsigned'),
    });
    await expect(
      new FillFasterSigner().sign(Buffer.from('%PDF-1.7 input')),
    ).rejects.toThrow('Document signing failed');
    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        fid: 'test-template',
        prefill_data: {},
        digitallySign: true,
        basePdf: expect.stringMatching(/^data:application\/pdf;base64,/),
      }),
      expect.objectContaining({ timeout: 60000 }),
    );
  });
  it('accepts a complete envelope and rejects appended or empty signatures', () => {
    expect(hasCompletePdfSignature(envelope())).toBe(true);
    expect(
      hasCompletePdfSignature(
        Buffer.concat([envelope(), Buffer.from('changed')]),
      ),
    ).toBe(false);
    expect(
      hasCompletePdfSignature(
        Buffer.from(envelope().toString().replace('12345678', '00000000')),
      ),
    ).toBe(false);
    expect(hasCompletePdfSignature(Buffer.from('not a pdf'))).toBe(false);
  });
});
