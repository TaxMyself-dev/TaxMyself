import axios from 'axios';
import {
  LycheeHttpPromptTransport,
  NoSendPromptTransport,
} from './lychee-prompt.transport';
jest.mock('axios');

describe('Question send API contract — mocked HTTP only', () => {
  const original = { ...process.env };
  const post = axios.post as jest.Mock;
  const request = {
    channel_id: 'test-channel',
    phone: '972501234567',
    text: 'לאיזה עסק לשייך את המסמך?',
    buttons: ['1. עסק א', '2. עסק ב'],
    reply_to_whatsapp_message_id: 'test-only-document',
  };
  beforeEach(() => {
    post.mockReset();
    process.env.LYCHEE_API_KEY = 'fake-key-for-unit-tests';
  });
  afterAll(() => {
    process.env = original;
  });
  it('returns only the actual provider WhatsApp ID and quotes the source document', async () => {
    post.mockResolvedValue({
      data: { whatsapp_message_id: 'test-only-provider-receipt' },
    });
    expect(await new LycheeHttpPromptTransport().send(request)).toBe(
      'test-only-provider-receipt',
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      'https://app.lychee-ltd.com/api/wap/make-send-text',
      request,
      expect.objectContaining({
        headers: { Authorization: 'Bearer fake-key-for-unit-tests' },
        maxRedirects: 0,
      }),
    );
  });
  it('does not retry an uncertain network result', async () => {
    post.mockRejectedValue(new Error('timeout after possible acceptance'));
    await expect(
      new LycheeHttpPromptTransport().send(request),
    ).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('refuses success without a valid provider receipt', async () => {
    for (const id of [undefined, '', ' ', 123, 'x'.repeat(256)]) {
      post.mockResolvedValue({ data: { whatsapp_message_id: id } });
      await expect(
        new LycheeHttpPromptTransport().send(request),
      ).rejects.toThrow('Question receipt unavailable');
    }
  });
  it('never calls HTTP in the registered no-send transport or without credentials', async () => {
    expect(new NoSendPromptTransport().available).toBe(false);
    await expect(new NoSendPromptTransport().send()).rejects.toThrow();
    delete process.env.LYCHEE_API_KEY;
    await expect(
      new LycheeHttpPromptTransport().send(request),
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
