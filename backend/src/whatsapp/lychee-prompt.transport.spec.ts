import axios from 'axios';
import {
  LycheeHttpPromptTransport,
  NoSendPromptTransport,
  DevelopmentOnlyPromptTransport,
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
    process.env.NODE_ENV = 'development';
    process.env.LYCHEE_CHANNEL_ID = 'test-channel';
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
  it('reports sanitized HTTP rejection diagnostics without retaining Axios request secrets', async () => {
    post.mockRejectedValue({
      response: {
        status: 403,
        data: {
          code: 'MISSING_PERMISSION',
          message: 'Requires conversations:write fake-key-for-unit-tests',
        },
      },
      config: { headers: { Authorization: 'Bearer fake-key-for-unit-tests' } },
    });
    const error = await new LycheeHttpPromptTransport()
      .send(request)
      .catch((e) => e);
    expect(error.diagnostic).toMatchObject({
      httpStatus: 403,
      providerCode: 'MISSING_PERMISSION',
      failureKind: 'http',
    });
    expect(error.diagnostic.providerReason).toContain('conversations:write');
    expect(JSON.stringify(error)).not.toContain('fake-key-for-unit-tests');
    expect(error.response).toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('distinguishes a successful HTTP response without a message receipt', async () => {
    post.mockResolvedValue({ status: 200, data: { success: true } });
    const error = await new LycheeHttpPromptTransport()
      .send(request)
      .catch((e) => e);
    expect(error.diagnostic).toEqual({
      httpStatus: 200,
      failureKind: 'missing_receipt',
    });
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
  it('never calls HTTP in the explicit no-send transport or without credentials', async () => {
    expect(new NoSendPromptTransport().available).toBe(false);
    await expect(new NoSendPromptTransport().send()).rejects.toThrow();
    delete process.env.LYCHEE_API_KEY;
    await expect(
      new LycheeHttpPromptTransport().send(request),
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it('allows the approved dev environment only after verifying the actual connection', async () => {
    const db: any = {
      options: { database: 'keepintax-dev' },
      query: jest.fn().mockResolvedValue([{ db: 'keepintax-dev' }]),
    };
    const transport = new DevelopmentOnlyPromptTransport(db);
    post.mockResolvedValue({ data: { whatsapp_message_id: 'test-only-id' } });
    expect(transport.available).toBe(true);
    expect(await transport.send(request)).toBe('test-only-id');
    expect(db.query).toHaveBeenCalledWith('SELECT DATABASE() AS db');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('never claims availability or connects for a prod database, even if env DB_DATABASE says dev', async () => {
    process.env.DB_DATABASE = 'keepintax-dev';
    for (const database of [
      'keepintax-prod',
      'keepintax_prodcopy',
      undefined,
    ]) {
      const db: any = { options: { database }, query: jest.fn() };
      const transport = new DevelopmentOnlyPromptTransport(db);
      expect(transport.available).toBe(false);
      await expect(transport.send(request)).rejects.toThrow();
      expect(db.query).not.toHaveBeenCalled();
    }
    expect(post).not.toHaveBeenCalled();
  });

  it('blocks non-development environments without any connection or HTTP', async () => {
    for (const nodeEnv of ['production', 'test', '', undefined]) {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      const db: any = {
        options: { database: 'keepintax-dev' },
        query: jest.fn(),
      };
      const transport = new DevelopmentOnlyPromptTransport(db);
      expect(transport.available).toBe(false);
      await expect(transport.send(request)).rejects.toThrow();
      expect(db.query).not.toHaveBeenCalled();
    }
    expect(post).not.toHaveBeenCalled();
  });

  it('blocks a mismatched live connection or channel before HTTP', async () => {
    const db: any = {
      options: { database: 'keepintax-dev' },
      query: jest.fn().mockResolvedValue([{ db: 'other' }]),
    };
    const transport = new DevelopmentOnlyPromptTransport(db);
    await expect(transport.send(request)).rejects.toThrow(
      'Development question database mismatch',
    );
    await expect(
      transport.send({ ...request, channel_id: 'other' }),
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it('blocks missing configuration before claiming availability', async () => {
    const db: any = {
      options: { database: 'keepintax-dev' },
      query: jest.fn(),
    };
    delete process.env.LYCHEE_API_KEY;
    expect(new DevelopmentOnlyPromptTransport(db).available).toBe(false);
    process.env.LYCHEE_API_KEY = 'fake';
    delete process.env.LYCHEE_CHANNEL_ID;
    expect(new DevelopmentOnlyPromptTransport(db).available).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});
