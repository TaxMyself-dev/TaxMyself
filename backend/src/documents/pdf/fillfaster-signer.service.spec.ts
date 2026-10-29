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
    await expect(
      new FillFasterSigner().sign(Buffer.from('%PDF-')),
    ).rejects.toThrow('configuration');
    expect(axios.post).not.toHaveBeenCalled();
  });
  it('sends a prepared PDF and rejects unsigned provider output without exposing credentials', async () => {
    process.env.FILLFASTER_API_TOKEN = 'test-secret';
    (axios.post as jest.Mock).mockResolvedValue({
      data: Buffer.from('%PDF-1.7 unsigned'),
    });
    await expect(
      new FillFasterSigner().sign(Buffer.from('%PDF-1.7 input')),
    ).rejects.toThrow('Document signing failed');
    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        fid: '3IfhJjgmAp',
        prefill_data: {},
        digitallySign: true,
        basePdf: expect.stringMatching(/^data:application\/pdf;base64,/),
      }),
      expect.objectContaining({ timeout: 60000 }),
    );
  });
  it('reports only safe provider status in development', async () => {
    process.env.NODE_ENV = 'development'; delete process.env.PDF_DIAGNOSTICS_FILE;
    process.env.FILLFASTER_API_TOKEN = 'test-secret';
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      (axios.post as jest.Mock).mockRejectedValue({response: {status: 401, data: 'private-body'}, config: {token: 'test-secret'}, message: 'private-error'});
      await expect(new FillFasterSigner().sign(Buffer.from('%PDF-input'))).rejects.toThrow('Document signing failed');
      expect(JSON.parse(log.mock.calls[0][0])).toEqual({event: 'pdf_signing_failure', reason: 'PROVIDER_REQUEST_FAILED', status: 401});
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|test-secret/);
    } finally { log.mockRestore(); }
  });
  it('distinguishes invalid signature output from HTTP rejection', async () => {
    process.env.NODE_ENV = 'development'; delete process.env.PDF_DIAGNOSTICS_FILE;
    process.env.FILLFASTER_API_TOKEN = 'test-secret';
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      (axios.post as jest.Mock).mockResolvedValue({status: 200, data: Buffer.from('%PDF-unsigned')});
      await expect(new FillFasterSigner().sign(Buffer.from('%PDF-input'))).rejects.toThrow('Document signing failed');
      expect(JSON.parse(log.mock.calls[0][0])).toEqual({event: 'pdf_signing_failure', reason: 'INVALID_SIGNATURE_ENVELOPE', status: 200});
    } finally { log.mockRestore(); }
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
