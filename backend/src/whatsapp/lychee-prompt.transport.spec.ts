import axios from 'axios';
import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  LycheeHttpPromptTransport,
  NoSendPromptTransport,
  ConfiguredLycheeTransport,
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
    buttons: [{ text: '1. עסק א' }, { text: '2. עסק ב' }],
    reply_to_whatsapp_message_id: 'test-only-document',
  };
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    process.env.NODE_ENV = 'development';
    process.env.DB_DATABASE = 'keepintax-dev';
    process.env.LYCHEE_CHANNEL_ID = 'test-channel';
    process.env.LYCHEE_API_KEY = 'fake-key-for-unit-tests';
  });
  afterAll(() => {
    process.env = original;
  });
  it.each(['success', 'failure'])(
    'sends a plain quoted %s result only through the development guard (mocked HTTP)',
    async (outcome) => {
      const result = {
        channel_id: request.channel_id,
        phone: request.phone,
        text:
          outcome === 'success'
            ? 'המסמך נשמר בהצלחה.'
            : 'לא הצלחנו להשלים את שמירת המסמך.',
        reply_to_whatsapp_message_id: request.reply_to_whatsapp_message_id,
      };
      const operationId = `notice:test-${outcome}`;
      const db: any = {
        options: { database: 'keepintax-dev' },
        query: jest.fn(async () => [{ db: 'keepintax-dev' }]),
      };
      post.mockResolvedValue({
        data: {
          ok: true,
          waId: 'wamid.test-only-result',
          messageId: internalId,
        },
      });
      expect(
        await new ConfiguredLycheeTransport(db).send(result, operationId),
      ).toBe('wamid.test-only-result');
      expect(db.query).toHaveBeenCalledWith('SELECT DATABASE() AS db');
      expect(post).toHaveBeenCalledTimes(1);
      expect(post.mock.calls[0][1]).toEqual(result);
      expect(post.mock.calls[0][1]).not.toHaveProperty('buttons');
      expect(post.mock.calls[0][2].headers['Idempotency-Key']).toBe(
        questionIdempotencyKey(result.channel_id, operationId),
      );
      expect(questionIdempotencyKey(result.channel_id, operationId)).not.toBe(
        questionIdempotencyKey(result.channel_id, `prompt:test-${outcome}`),
      );
      expect(get).not.toHaveBeenCalled();
    },
  );
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
  it('serializes legacy saved string buttons as text objects without mutating the draft or sending twice', async () => {
    const legacy: any = { ...request, buttons: ['1. עסק א', '2. עסק ב'] };
    const before = JSON.stringify(legacy);
    post.mockResolvedValue({
      data: { whatsapp_message_id: 'wamid.test-only-question' },
    });
    await new LycheeHttpPromptTransport().send(legacy, 'test-only-prompt');
    expect(post.mock.calls[0][1]).toEqual({
      ...request,
      buttons: [{ text: '1. עסק א' }, { text: '2. עסק ב' }],
    });
    expect(JSON.stringify(legacy)).toBe(before);
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
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
      get.mockResolvedValue({
        status: 200,
        data: {
          ...data,
          message_id: internalId,
          channel_id: request.channel_id,
        },
      });
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
  it.each([internalId, 'wamid.test-only-question'])(
    'falls back to message-get for messageId %s when waId is absent',
    async (reference) => {
      post.mockResolvedValue({
        status: 200,
        data: { ok: true, messageId: reference },
      });
      get.mockResolvedValue({
        status: 200,
        data: {
          message_id: internalId,
          whatsapp_message_id: 'wamid.test-only-question',
          channel_id: request.channel_id,
        },
      });
      expect(
        await new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
      ).toBe('wamid.test-only-question');
      expect(get).toHaveBeenCalledWith(
        'https://app.lychee-ltd.com/api/wap/message-get',
        expect.objectContaining({
          params:
            reference === internalId
              ? { message_id: internalId }
              : { whatsapp_message_id: reference },
        }),
      );
      expect(post).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { ok: true, waId: ' ' },
    {
      ok: true,
      messageId: internalId,
      message_id: 'conflicting-id',
      waId: null,
    },
  ])(
    'rejects unusable waId without an unambiguous fallback: %j',
    async (data) => {
      post.mockResolvedValue({ status: 200, data });
      await expect(
        new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
      ).rejects.toThrow();
      expect(get).not.toHaveBeenCalled();
      expect(post).toHaveBeenCalledTimes(1);
    },
  );
  it('measures the environment DB check separately from the actual HTTP send', async () => {
    let now = 1000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => {});
    try {
      const db: any = {
        options: { database: 'keepintax-dev' },
        query: jest.fn(async () => {
          now += 70;
          return [{ db: 'keepintax-dev' }];
        }),
      };
      post.mockImplementation(async () => {
        now += 2250;
        return {
          status: 200,
          data: { ok: true, waId: 'wamid.test-only-question' },
        };
      });
      await new ConfiguredLycheeTransport(db).send(request, 'test-only-prompt');
      const logs = debug.mock.calls.map((args) =>
        JSON.parse(args[0] as string),
      );
      expect(
        logs.find(
          (line) =>
            line.stage === 'business.prompt.db.environment' &&
            line.outcome === 'completed',
        ).durationMs,
      ).toBe(70);
      expect(
        logs.find(
          (line) =>
            line.stage === 'business.prompt.http.send' &&
            line.outcome === 'completed',
        ).durationMs,
      ).toBe(2250);
      expect(post).toHaveBeenCalledTimes(1);
      expect(get).not.toHaveBeenCalled();
      expect(JSON.stringify(logs)).not.toContain('fake-key-for-unit-tests');
    } finally {
      clock.mockRestore();
      debug.mockRestore();
    }
  });

  it('measures receipt lookup time separately from HTTP send time', async () => {
    let now = 1000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => {});
    try {
      post.mockImplementation(async () => {
        now += 100;
        return { status: 200, data: { ok: true, messageId: internalId } };
      });
      get.mockImplementation(async () => {
        now += 300;
        return {
          status: 200,
          data: {
            message_id: internalId,
            whatsapp_message_id: 'wamid.test-only-question',
            channel_id: request.channel_id,
          },
        };
      });
      await new LycheeHttpPromptTransport().send(request, 'test-only-prompt');
      const logs = debug.mock.calls.map((args) =>
        JSON.parse(args[0] as string),
      );
      expect(
        logs.find(
          (line) =>
            line.stage === 'business.prompt.http.send' &&
            line.outcome === 'completed',
        ).durationMs,
      ).toBe(100);
      expect(
        logs.find(
          (line) =>
            line.stage === 'business.prompt.http.receipt_lookup' &&
            line.outcome === 'completed',
        ).durationMs,
      ).toBe(300);
      expect(post).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
      debug.mockRestore();
    }
  });

  it('prefers the provider-confirmed waId and skips lookup even when messageId is present', async () => {
    post.mockResolvedValue({
      status: 200,
      data: {
        ok: true,
        messageId: internalId,
        waId: 'wamid.actual-question',
        whatsapp_message_id: 'wamid.legacy-alias',
      },
    });
    expect(
      await new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
    ).toBe('wamid.actual-question');
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
  });
  it.each([undefined, null, '', ' ', 123, 'bad whitespace', 'x'.repeat(256)])(
    'uses the read-only fallback for missing or malformed waId: %j',
    async (waId) => {
      post.mockResolvedValue({
        status: 200,
        data: { ok: true, messageId: internalId, waId },
      });
      get.mockResolvedValue({
        status: 200,
        data: {
          message_id: internalId,
          channel_id: request.channel_id,
          whatsapp_message_id: 'wamid.verified-question',
        },
      });
      expect(
        await new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
      ).toBe('wamid.verified-question');
      expect(post).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledTimes(1);
    },
  );
  it('does not accept waId on a failed response or use it as a lookup receipt alias', async () => {
    post.mockResolvedValue({
      status: 200,
      data: { ok: false, messageId: internalId, waId: 'wamid.rejected' },
    });
    await expect(
      new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
    ).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
    post.mockResolvedValue({
      status: 200,
      data: { ok: true, messageId: internalId },
    });
    get.mockResolvedValue({
      status: 200,
      data: {
        message_id: internalId,
        channel_id: request.channel_id,
        waId: 'wamid.not-a-documented-read-field',
      },
    });
    await expect(
      new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
    ).rejects.toThrow();
  });
  it.each([
    {
      channel_id: 'wrong-channel',
      message_id: internalId,
      whatsapp_message_id: 'wamid.test-only-question',
    },
    {
      channel_id: request.channel_id,
      message_id: 'wrong-internal-id',
      whatsapp_message_id: 'wamid.test-only-question',
    },
  ])(
    'refuses a read receipt belonging to another identity or channel: %j',
    async (data) => {
      post.mockResolvedValue({
        status: 200,
        data: { ok: true, messageId: internalId },
      });
      get.mockResolvedValue({ status: 200, data });
      await expect(
        new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
      ).rejects.toThrow();
      expect(post).toHaveBeenCalledTimes(1);
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
  it('logs response field paths and types on missing receipt without response values or secrets', async () => {
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => {});
    try {
      post.mockResolvedValue({
        status: 200,
        data: {
          ok: true,
          data: {
            id: 'private-provider-value',
            phone: request.phone,
            text: request.text,
            token: 'fake-key-for-unit-tests',
          },
        },
      });
      await expect(
        new LycheeHttpPromptTransport().send(request, 'test-only-prompt'),
      ).rejects.toThrow();
      const log = debug.mock.calls
        .map((args) => JSON.parse(args[0] as string))
        .find((line) => line.stage === 'business.prompt.response');
      expect(log).toMatchObject({
        httpStatus: 200,
        responseShape: {
          '$.ok': 'boolean',
          '$.data.id': 'string',
          '$.data.phone': 'string',
          '$.data.token': 'omitted',
        },
      });
      for (const value of [
        'private-provider-value',
        request.phone,
        request.text,
        'fake-key-for-unit-tests',
      ])
        expect(JSON.stringify(log)).not.toContain(value);
      expect(post).toHaveBeenCalledTimes(1);
      expect(get).not.toHaveBeenCalled();
    } finally {
      debug.mockRestore();
    }
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
    const transport = new ConfiguredLycheeTransport(db);
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
      const transport = new ConfiguredLycheeTransport(db);
      expect(transport.available).toBe(false);
      await expect(
        transport.send(request, 'test-only-prompt'),
      ).rejects.toThrow();
      expect(db.query).not.toHaveBeenCalled();
    }
    expect(post).not.toHaveBeenCalled();
  });

  it('blocks invalid environment/database combinations without any connection or HTTP', async () => {
    for (const nodeEnv of ['production', 'test', '', undefined]) {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      const db: any = {
        options: { database: 'keepintax-dev' },
        query: jest.fn(),
      };
      const transport = new ConfiguredLycheeTransport(db);
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
    const transport = new ConfiguredLycheeTransport(db);
    await expect(transport.send(request, 'test-only-prompt')).rejects.toThrow(
      'Lychee delivery environment or database mismatch',
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
    expect(new ConfiguredLycheeTransport(db).available).toBe(false);
    process.env.LYCHEE_API_KEY = 'fake';
    delete process.env.LYCHEE_CHANNEL_ID;
    expect(new ConfiguredLycheeTransport(db).available).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
  it('supports production buttons with an environment-scoped stable idempotency key', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_DATABASE = 'keepintax-prod';
    const db: any = {
      options: { database: 'keepintax-prod' },
      query: jest.fn(async () => [{ db: 'keepintax-prod' }]),
    };
    const transport = new ConfiguredLycheeTransport(db);
    const scope = {
      environment: 'production' as const,
      database: 'keepintax-prod',
    };
    post.mockResolvedValue({
      data: { ok: true, waId: 'wamid.fake-production-question' },
    });
    expect(transport.available).toBe(true);
    expect(await transport.send(request, 'prompt:fake-prod')).toBe(
      'wamid.fake-production-question',
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toEqual(request);
    const id = post.mock.calls[0][2].headers['Idempotency-Key'];
    expect(id).toBe(
      questionIdempotencyKey(request.channel_id, 'prompt:fake-prod', scope),
    );
    expect(id).not.toBe(
      questionIdempotencyKey(request.channel_id, 'prompt:fake-prod'),
    );
    process.env.LYCHEE_API_KEY = 'fake-rotated-key';
    expect(
      questionIdempotencyKey(request.channel_id, 'prompt:fake-prod', scope),
    ).toBe(id);
  });
  it('preserves the legacy development operation key exactly', () => {
    const expected =
      'lychee-question-' +
      createHash('sha256')
        .update(
          JSON.stringify([
            'lychee.business-question.dev.v1',
            request.channel_id,
            'old-prompt',
          ]),
        )
        .digest('hex');
    expect(questionIdempotencyKey(request.channel_id, 'old-prompt')).toBe(
      expected,
    );
    expect(
      questionIdempotencyKey(request.channel_id, 'old-prompt', {
        environment: 'development',
        database: 'keepintax-dev',
      }),
    ).toBe(expected);
  });
  it.each([
    ['production', 'keepintax-prod', 'keepintax-dev'],
    ['production', 'keepintax-dev', 'keepintax-dev'],
    ['development', 'keepintax-prod', 'keepintax-prod'],
    ['production', 'keepintax_prodcopy', 'keepintax_prodcopy'],
    ['production', undefined, 'keepintax-prod'],
  ])(
    'blocks cross-environment configuration %s / %s / %s before database or HTTP',
    async (nodeEnv, databaseEnv, configuredDatabase) => {
      process.env.NODE_ENV = nodeEnv;
      if (databaseEnv === undefined) delete process.env.DB_DATABASE;
      else process.env.DB_DATABASE = databaseEnv;
      const db: any = {
        options: { database: configuredDatabase },
        query: jest.fn(),
      };
      const transport = new ConfiguredLycheeTransport(db);
      expect(transport.available).toBe(false);
      await expect(transport.send(request, 'fake-prompt')).rejects.toThrow();
      expect(db.query).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    },
  );
  it('blocks a production runtime connected to dev despite matching configured production names', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_DATABASE = 'keepintax-prod';
    const db: any = {
      options: { database: 'keepintax-prod' },
      query: jest.fn(async () => [{ db: 'keepintax-dev' }]),
    };
    await expect(
      new ConfiguredLycheeTransport(db).send(request, 'fake-prompt'),
    ).rejects.toThrow('mismatch');
    expect(post).not.toHaveBeenCalled();
  });
  it.each(['channel', 'key', 'database', 'environment'])(
    'blocks configuration drift during the connection check: %s',
    async (changed) => {
      process.env.NODE_ENV = 'production';
      process.env.DB_DATABASE = 'keepintax-prod';
      const db: any = {
        options: { database: 'keepintax-prod' },
        query: jest.fn(async () => {
          if (changed === 'channel')
            process.env.LYCHEE_CHANNEL_ID = 'other-channel';
          if (changed === 'key') process.env.LYCHEE_API_KEY = 'other-key';
          if (changed === 'database') process.env.DB_DATABASE = 'keepintax-dev';
          if (changed === 'environment') process.env.NODE_ENV = 'development';
          return [{ db: 'keepintax-prod' }];
        }),
      };
      await expect(
        new ConfiguredLycheeTransport(db).send(request, 'fake-prompt'),
      ).rejects.toThrow('mismatch');
      expect(post).not.toHaveBeenCalled();
    },
  );
});
