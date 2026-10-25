import axios from 'axios';
import { lookup } from 'dns/promises';
import { LycheeClient } from './lychee-client.service';
jest.mock('axios');
jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

describe('Lychee media download boundary', () => {
  const original = { ...process.env };
  const get = axios.get as jest.Mock;
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.LYCHEE_API_KEY = 'fake-key';
    process.env.LYCHEE_MEDIA_HOSTS = 'media.example.com';
  });
  afterAll(() => {
    process.env = original;
  });
  it('downloads original bytes without forwarding API credentials to media host', async () => {
    get
      .mockResolvedValueOnce({
        data: {
          url: 'https://media.example.com/file?signature=test',
          file_name: 'test.pdf',
        },
      })
      .mockResolvedValueOnce({ data: Buffer.from('%PDF-test') });
    (lookup as jest.Mock).mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
    ]);
    const result = await new LycheeClient().download('msg');
    expect(result.mimeType).toBe('application/pdf');
    expect(get.mock.calls[0][1].headers.Authorization).toBe('Bearer fake-key');
    expect(get.mock.calls[1][1].headers.Authorization).toBeUndefined();
    expect(get.mock.calls[1][1].maxRedirects).toBe(0);
  });
  it('rejects unapproved hosts and non-public resolved addresses', async () => {
    get.mockResolvedValueOnce({
      data: { url: 'https://untrusted.example/file' },
    });
    await expect(new LycheeClient().download('msg')).rejects.toThrow(
      'Untrusted media host',
    );
    expect(lookup).not.toHaveBeenCalled();
    get.mockResolvedValueOnce({
      data: { url: 'https://media.example.com/file' },
    });
    (lookup as jest.Mock).mockResolvedValue([
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(new LycheeClient().download('msg')).rejects.toThrow(
      'Non-public media destination',
    );
    expect(get).toHaveBeenCalledTimes(2);
  });
});
