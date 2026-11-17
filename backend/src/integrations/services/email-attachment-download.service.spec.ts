import axios from 'axios';
import { Readable } from 'stream';
import { EmailAttachmentDownloadService, isPublicDownloadAddress } from './email-attachment-download.service';
jest.mock('axios');

describe('Bounded attachment downloads', () => {
  const service = new EmailAttachmentDownloadService();
  beforeEach(() => { jest.clearAllMocks(); process.env.COMPOSIO_DOWNLOAD_ALLOWED_HOSTS = 'files.example.com'; });
  it.each(['http://files.example.com/file', 'https://127.0.0.1/file', 'https://files.example.com.attacker.test/file', 'https://user:pass@files.example.com/file', 'https://files.example.com:8443/file'])('blocks unsafe URL %s', async url => {
    await expect(service.download(url)).rejects.toMatchObject({ category: 'CONFIG' });
    expect(axios.get).not.toHaveBeenCalled();
  });
  it('requires exact configured hosts, disables redirects and does not send credentials', async () => {
    (axios.get as jest.Mock).mockResolvedValue({ headers: {}, data: Readable.from([Buffer.from('pdf')]) });
    expect(await service.download('https://files.example.com/file?signature=secret')).toEqual(Buffer.from('pdf'));
    expect(axios.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxRedirects: 0, proxy: false, responseType: 'stream' }));
    expect((axios.get as jest.Mock).mock.calls[0][1].headers).toBeUndefined();
  });
  it('bounds bytes even without a content-length', async () => {
    (axios.get as jest.Mock).mockResolvedValue({ headers: {}, data: Readable.from([Buffer.alloc(26 * 1024 * 1024)]) });
    await expect(service.download('https://files.example.com/file')).rejects.toMatchObject({ category: 'CONTRACT' });
  });
  it('sanitizes errors containing signed URLs', async () => {
    (axios.get as jest.Mock).mockRejectedValue(new Error('https://files.example.com?secret=token'));
    await expect(service.download('https://files.example.com/file')).rejects.toMatchObject({ message: 'Email provider failure: TRANSIENT' });
  });
  it.each(['127.0.0.1', '10.1.2.3', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1'])('blocks non-public DNS results %s', address => {
    expect(isPublicDownloadAddress(address)).toBe(false);
  });

  it('prefers public IPv4 when DNS returns IPv6 first', async () => {
    const dns = require('dns');
    const lookup = jest.spyOn(dns, 'lookup').mockImplementation((_host: any, _options: any, callback: any) => {
      callback(null, [{ address: '2606:4700:113::1', family: 6 }, { address: '172.64.66.1', family: 4 }]);
    });
    try {
      (axios.get as jest.Mock).mockImplementation(async (_url, options) => {
        const selected = await new Promise(resolve => options.httpsAgent.options.lookup('files.example.com', { all: true }, (_error, values) => resolve(values)));
        expect(selected).toEqual([{ address: '172.64.66.1', family: 4 }]);
        return { headers: {}, data: Readable.from([Buffer.from('pdf')]) };
      });
      expect(await service.download('https://files.example.com/file')).toEqual(Buffer.from('pdf'));
    } finally { lookup.mockRestore(); }
  });
});
