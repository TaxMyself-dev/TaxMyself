import axios from 'axios';
import {
  LycheeHttpPromptTransport,
  NoSendPromptTransport,
  DevelopmentOnlyPromptTransport,
  questionIdempotencyKey,
} from './lychee-prompt.transport';
jest.mock('axios');

describe('Question send API contract — mocked HTTP only', () => {
  const original = { ...process.env };
  const post = axios.post as jest.Mock;
  const get = axios.get as jest.Mock;
  const internalId = '0c6f1b52-4a2d-4d1e-9f30-6b1c7a2e5d84';
  const request = {
    channel_id: 'test-channel',
    phone: '972501234567',
    text: 'לאיזה עסק לשייך את המסמך?',
    buttons: ['1. עסק א', '2. עסק ב'],
    reply_to_whatsapp_message_id: 'test-only-document',
  };
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
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
    expect(
      await new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
    ).toBe('test-only-provider-receipt');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      'https://app.lychee-ltd.com/api/wap/make-send-text',
      request,
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer fake-key-for-unit-tests',
          'Idempotency-Key': questionIdempotencyKey(
            request.channel_id,
            'test-only-prompt',
          ),
        },
        maxRedirects: 0,
      }),
    );
  });
  it.each([
    { whatsapp_message_id: 'wamid.test-only-question' },
    { message: { whatsapp_message_id: 'wamid.test-only-question' } },
  ])(
    'resolves the documented internal send ID using a read-only lookup: %j',
    async (data) => {
      post.mockResolvedValue({
        status: 200,
        data: { ok: true, message_id: internalId },
      });
      get.mockResolvedValue({ status: 200, data });
      expect(
        await new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
      ).toBe('wamid.test-only-question');
      expect(post).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledWith(
        'https://app.lychee-ltd.com/api/wap/message-get',
        expect.objectContaining({
          params: { message_id: internalId },
          headers: { Authorization: 'Bearer fake-key-for-unit-tests' },
          maxRedirects: 0,
        }),
      );
    },
  );
  it('accepts an explicit nested WhatsApp receipt without another request', async () => {
    post.mockResolvedValue({
      data: {
        ok: true,
        message: { whatsapp_message_id: 'wamid.test-only-question' },
      },
    });
    expect(
      await new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
    ).toBe('wamid.test-only-question');
    expect(get).not.toHaveBeenCalled();
  });
  it.each([
    { ok: true, message_id: internalId },
    { message: { id: internalId } },
    { whatsapp_message_id: 'one', message: { whatsapp_message_id: 'another' } },
    { ok: false, whatsapp_message_id: 'must-not-be-linked' },
  ])(
    'never substitutes internal or ambiguous IDs after lookup: %j',
    async (data) => {
      post.mockResolvedValue({
        status: 200,
        data: { ok: true, message_id: internalId },
      });
      get.mockResolvedValue({ status: 200, data });
      const error = await new LycheeHttpPromptTransport()
        .send(request, 'test-only-prompt')
        .catch((e) => e);
      expect(error.diagnostic).toMatchObject({
        failureKind: 'missing_receipt',
        lycheeMessageId: internalId,
      });
      expect(post).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledTimes(1);
    },
  );
  it('reports lookup failures with a safe internal ID and never sends again', async () => {
    post.mockResolvedValue({
      status: 200,
      data: { ok: true, message_id: internalId },
    });
    get.mockRejectedValue({
      response: { status: 404, data: { message: 'Message not ready' } },
    });
    const error = await new LycheeHttpPromptTransport()
      .send(request, 'test-only-prompt')
      .catch((e) => e);
    expect(error.diagnostic).toMatchObject({
      httpStatus: 404,
      providerReason: 'Message not ready',
      lycheeMessageId: internalId,
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('does not treat HTTP 200 with ok:false as a successful receipt', async () => {
    post.mockResolvedValue({
      status: 200,
      data: { ok: false, message_id: internalId, whatsapp_message_id: 'bad' },
    });
    await expect(
      new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
    ).rejects.toThrow('Question receipt unavailable');
    expect(get).not.toHaveBeenCalled();
  });
  it('uses the same header across transport recreation and credential rotation, isolating questions and channels', async () => {
    post.mockResolvedValue({ data: { whatsapp_message_id: 'test-only-id' } });
    await new LycheeHttpPromptTransport().send(request, 'prompt:one');
    process.env.LYCHEE_API_KEY = 'different-fake-key';
    await new LycheeHttpPromptTransport().send(request, 'prompt:one');
    await new LycheeHttpPromptTransport().send(request, 'prompt:two');
    await new LycheeHttpPromptTransport().send(
      { ...request, channel_id: 'another-channel' },
      'prompt:one',
    );
    const keys = post.mock.calls.map(
      (call) => call[2].headers['Idempotency-Key'],
    );
    expect(keys[0]).toMatch(/^lychee-question-[a-f0-9]{64}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[0]);
    expect(keys.join()).not.toContain(request.phone);
    expect(keys.join()).not.toContain('prompt:one');
  });
  it('rejects a missing or malformed operation identifier before HTTP', async () => {
    for (const questionId of [
      undefined,
      '',
      'bad\r\nheader',
      'x'.repeat(256),
    ]) {
      await expect(
        new LycheeHttpPromptTransport().send(request, questionId as any),
      ).rejects.toThrow('Invalid question operation identifier');
    }
    expect(post).not.toHaveBeenCalled();
  });
  it('does not retry an uncertain network result', async () => {
    post.mockRejectedValue(new Error('timeout after possible acceptance'));
    await expect(
      new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
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
      .send(request, 'test-only-prompt')
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
      .send(request, 'test-only-prompt')
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
        new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
      ).rejects.toThrow('Question receipt unavailable');
    }
  });
  it('never calls HTTP in the explicit no-send transport or without credentials', async () => {
    expect(new NoSendPromptTransport().available).toBe(false);
    await expect(new NoSendPromptTransport().send()).rejects.toThrow();
    delete process.env.LYCHEE_API_KEY;
    await expect(
      new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
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
    expect(await transport.send(request, 'test-only-prompt')).toBe(
      'test-only-id',
    );
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
      await expect(
        transport.send(request, 'test-only-prompt'),
      ).rejects.toThrow();
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
      await expect(
        transport.send(request, 'test-only-prompt'),
      ).rejects.toThrow();
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
    await expect(transport.send(request, 'test-only-prompt')).rejects.toThrow(
      'Development question database mismatch',
    );
    await expect(
      transport.send({ ...request, channel_id: 'other' }, 'test-only-prompt'),
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
