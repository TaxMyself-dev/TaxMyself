import { createHmac } from 'crypto';
import { parseLycheeEvent } from './lychee-webhook.controller';
import { detectLycheeMime } from './lychee-client.service';
import { LycheeEventStore } from './lychee-event.store';
import { LycheeIntakeService } from './lychee-intake.service';
import { lycheeSender } from './lychee-sender';
import { buildBusinessQuestion } from './lychee-business-question';
import { DocumentImportBlockedError } from '../document-import/document-import-blocked.error';

const event: any = {
  event: 'message.received',
  event_id: 'event1',
  channel_id: 'channel1',
  message_id: 'message1',
  whatsapp_message_id: 'wamid.1',
  sender_phone: '972501234567',
  contact_phone: '972501234567',
  has_media: true,
  message_type: 'document',
  text: 'test.pdf',
  reply_to_whatsapp_message_id: null,
};
const job: any = {
  event_id: 'event1',
  payload: event,
  attempts: 1,
  lease_token: 'lease1',
};

describe('Lychee signed intake', () => {
  it('accepts the updated Keepintax provider payload', () => {
    const channel = '73971d88-8e11-4f58-958c-7472129063e7';
    const updated = {
      ...event,
      channel_id: channel,
      occurred_at: '2026-10-29T08:41:12.517Z',
      channel_name: 'Keepintax',
      channel_phone: '0553081341',
      contact_phone: '0501234567',
      text: '#dev חשבונית לבדיקה',
      sender_phone: null,
      sender_name: null,
    };
    const raw = Buffer.from(JSON.stringify(updated));
    const signature =
      'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
    expect(
      lycheeSender(parseLycheeEvent(raw, signature, 'secret', channel)),
    ).toBe('972501234567');
  });
  it('looks up prompt ownership by channel and normalized phone even after completion', async () => {
    const db: any = {
      query: jest.fn().mockResolvedValue([{ event_id: 'doc' }]),
    };
    const store = new LycheeEventStore(db);
    expect(
      await store.ownsReply({
        ...event,
        sender_phone: null,
        contact_phone: '0501234567',
        reply_to_whatsapp_message_id: 'prompt',
      }),
    ).toBe(true);
    expect(db.query.mock.calls[0][1]).toEqual([
      'channel1',
      '972501234567',
      'prompt',
    ]);
    expect(db.query.mock.calls[0][0]).not.toContain('WAITING_FOR_BUSINESS');
    db.query.mockResolvedValue([]);
    expect(
      await store.ownsReply({
        ...event,
        reply_to_whatsapp_message_id: 'unknown',
      }),
    ).toBe(false);
    db.query.mockResolvedValue([{ event_id: 'a' }, { event_id: 'b' }]);
    await expect(
      store.ownsReply({ ...event, reply_to_whatsapp_message_id: 'ambiguous' }),
    ).rejects.toThrow();
  });
  it('records prompt IDs scoped to document, channel and owner; refuses replacing existing mapping', async () => {
    const db: any = {
      query: jest
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce([{ prompt_whatsapp_message_id: 'prompt' }]),
    };
    const store = new LycheeEventStore(db);
    await store.recordPrompt('doc', 'channel1', 'owner', 'prompt');
    expect(db.query.mock.calls[0][1]).toEqual([
      'prompt',
      'doc',
      'channel1',
      'owner',
      'prompt',
    ]);
    db.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([{ prompt_whatsapp_message_id: 'other' }]);
    await expect(
      store.recordPrompt('doc', 'channel1', 'owner', 'prompt'),
    ).rejects.toThrow();
  });
  it('accepts absent sender with local contact phone, but rejects malformed or conflicting sender', () => {
    for (const sender_phone of [null, undefined, '', '  ']) {
      const input = { ...event, sender_phone, contact_phone: '0501234567' };
      const bytes = Buffer.from(JSON.stringify(input));
      const sig =
        'sha256=' + createHmac('sha256', 'secret').update(bytes).digest('hex');
      expect(
        lycheeSender(parseLycheeEvent(bytes, sig, 'secret', 'channel1')),
      ).toBe('972501234567');
    }
    expect(
      lycheeSender({ sender_phone: 'bad', contact_phone: '0501234567' }),
    ).toBeNull();
    expect(
      lycheeSender({ sender_phone: '0541234567', contact_phone: '0501234567' }),
    ).toBeNull();
    expect(lycheeSender({ sender_phone: null, contact_phone: '' })).toBeNull();
  });
  const raw = Buffer.from(JSON.stringify(event, null, 2));
  const signature =
    'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
  it('verifies original bytes and rejects reserialized JSON', () => {
    expect(parseLycheeEvent(raw, signature, 'secret', 'channel1')).toEqual(
      event,
    );
    expect(() =>
      parseLycheeEvent(
        Buffer.from(JSON.stringify(event)),
        signature,
        'secret',
        'channel1',
      ),
    ).toThrow();
  });
  it('rejects wrong channel, missing and malformed signatures', () => {
    expect(() => parseLycheeEvent(raw, signature, 'secret', 'other')).toThrow();
    for (const bad of [undefined, '', 'א'.repeat(71)]) {
      expect(() => parseLycheeEvent(raw, bad, 'secret', 'channel1')).toThrow();
    }
  });
  it('accepts only supported media bytes and bounded size', () => {
    expect(detectLycheeMime(Buffer.from('%PDF-test'))).toBe('application/pdf');
    expect(detectLycheeMime(Buffer.from([255, 216, 255]))).toBe('image/jpeg');
    expect(() => detectLycheeMime(Buffer.from('<html>'))).toThrow();
    expect(() =>
      detectLycheeMime(Buffer.alloc(10 * 1024 * 1024 + 1)),
    ).toThrow();
  });
  it('persists event before acknowledging, and distinguishes duplicate payloads', async () => {
    const db: any = { query: jest.fn().mockResolvedValueOnce({}) };
    const store = new LycheeEventStore(db);
    await store.enqueue(event);
    expect(db.query.mock.calls[0][0]).toContain(
      'INSERT INTO lychee_intake_events',
    );
    const hash = db.query.mock.calls[0][1][5];
    db.query
      .mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' })
      .mockResolvedValueOnce([{ payload_hash: hash }]);
    await expect(store.enqueue(event)).resolves.toBe('DUPLICATE');
    db.query
      .mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' })
      .mockResolvedValueOnce([{ payload_hash: 'different' }]);
    await expect(store.enqueue(event)).rejects.toThrow(
      'Event identifier reused',
    );
  });
  it('requires exact prompt, sender, owner and unique business label for selection', async () => {
    const db: any = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            event_id: 'doc',
            business_choices: [{ label: '123', businessNumber: '123' }],
          },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 }),
    };
    const store = new LycheeEventStore(db);
    expect(
      await store.selectBusiness(
        { ...event, text: '123', reply_to_whatsapp_message_id: 'prompt' },
        'owner',
      ),
    ).toBe(true);
    expect(db.query.mock.calls[0][1]).toEqual([
      'channel1',
      '972501234567',
      'owner',
      'prompt',
    ]);
    expect(await store.selectBusiness(event, 'owner')).toBe(false);
  });

  it('selects separate businesses for two documents answered out of order (simulated prompt IDs only)', async () => {
    const choices = buildBusinessQuestion(event, '972501234567', [
      { businessNumber: '123', businessName: 'נגרות' },
      { businessNumber: '456', businessName: 'ייעוץ' },
    ]).choices;
    const rows = ['A', 'B'].map((id) => ({
      event_id: 'document-' + id,
      channel_id: 'channel1',
      sender_phone: '972501234567',
      firebase_id: 'owner',
      prompt: 'test-only-prompt-' + id,
      business_choices: choices,
      status: 'WAITING_FOR_BUSINESS',
      business_number: null,
    }));
    const db: any = {
      query: jest.fn(async (sql: string, args: any[]) => {
        if (sql.trim().startsWith('SELECT'))
          return rows.filter(
            (r) =>
              r.channel_id === args[0] &&
              r.sender_phone === args[1] &&
              r.firebase_id === args[2] &&
              r.prompt === args[3] &&
              r.status === 'WAITING_FOR_BUSINESS',
          );
        const row = rows.find(
          (r) => r.event_id === args[1] && r.status === 'WAITING_FOR_BUSINESS',
        );
        if (!row) return { affectedRows: 0 };
        row.business_number = args[0];
        row.status = 'PENDING';
        return { affectedRows: 1 };
      }),
    };
    const store = new LycheeEventStore(db);
    const reply = (id: string, label: string) => ({
      ...event,
      has_media: false,
      message_type: 'text',
      reply_to_whatsapp_message_id: 'test-only-prompt-' + id,
      text: label,
    });
    expect(
      await store.selectBusiness(reply('B', choices[1].label), 'wrong-owner'),
    ).toBe(false);
    expect(
      await store.selectBusiness(reply('B', 'unknown business'), 'owner'),
    ).toBe(false);
    expect(
      await store.selectBusiness(reply('B', choices[1].label), 'owner'),
    ).toBe(true);
    expect(rows[0].business_number).toBeNull();
    expect(rows[1].business_number).toBe('456');
    expect(
      await store.selectBusiness(reply('A', choices[0].label), 'owner'),
    ).toBe(true);
    expect(rows.map((r) => r.business_number)).toEqual(['123', '456']);
    expect(
      await store.selectBusiness(reply('B', choices[0].label), 'owner'),
    ).toBe(false);
    expect(rows[1].business_number).toBe('456');
  });
});

describe('Lychee document workflow without sending', () => {
  let store: any,
    client: any,
    importer: any,
    users: any,
    businesses: any,
    prompts: any,
    notifications: any,
    service: LycheeIntakeService;
  beforeEach(() => {
    store = {
      complete: jest.fn(),
      waitForBusiness: jest.fn(),
      prepared: jest.fn().mockResolvedValue({}),
      enqueue: jest.fn(),
      selectBusiness: jest.fn().mockResolvedValue(false),
      explainSelectedBusiness: jest.fn().mockResolvedValue(false),
      claim: jest.fn(),
      retry: jest.fn(),
      block: jest.fn(),
    };
    client = {
      download: jest.fn().mockResolvedValue({
        content: Buffer.from('%PDF-test'),
        filename: 'test.pdf',
        mimeType: 'application/pdf',
      }),
    };
    importer = {
      importDocument: jest
        .fn()
        .mockResolvedValue({ status: 'IMPORTED', driveFileId: 'drive1' }),
    };
    const query: any = {
      where: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ firebaseId: 'owner' }]),
    };
    users = { createQueryBuilder: () => query };
    businesses = {
      find: jest.fn().mockResolvedValue([{ businessNumber: '123' }]),
    };
    prompts = { wake: jest.fn() };
    notifications = { wake: jest.fn() };
    const documentsService = {
      processInboxForUser: jest.fn().mockResolvedValue({
        processed: 1,
        failed: 0,
        alreadyProcessing: false,
      }),
    };
    service = new LycheeIntakeService(
      store,
      client,
      importer,
      users,
      businesses,
      prompts,
      notifications,
      documentsService as any,
    );
  });
  it('wakes result delivery only after import completion has committed', async () => {
    let commit!: () => void;
    store.complete.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        commit = resolve;
      }),
    );
    const processing = service.process(job);
    for (let i = 0; i < 40 && !store.complete.mock.calls.length; i++)
      await Promise.resolve();
    expect(store.complete).toHaveBeenCalled();
    expect(notifications.wake).not.toHaveBeenCalled();
    commit();
    await processing;
    expect(notifications.wake).toHaveBeenCalledTimes(1);
  });
  it('does not wake result delivery when completion persistence fails', async () => {
    store.complete.mockRejectedValueOnce(new Error('fake database failure'));
    await expect(service.process(job)).rejects.toThrow();
    expect(notifications.wake).not.toHaveBeenCalled();
  });
  it('routes a repeat choice to the explanation outbox without importing or overwriting reply status', async () => {
    const reply = {
      ...job,
      payload: {
        ...event,
        has_media: false,
        text: 'second choice',
        reply_to_whatsapp_message_id: 'old-question',
      },
    };
    store.explainSelectedBusiness.mockResolvedValueOnce(true);
    await service.process(reply);
    expect(store.explainSelectedBusiness).toHaveBeenCalledWith(reply, 'owner');
    expect(notifications.wake).toHaveBeenCalledTimes(1);
    expect(store.complete).not.toHaveBeenCalled();
    expect(importer.importDocument).not.toHaveBeenCalled();
    expect(client.download).not.toHaveBeenCalled();
  });
  it('acknowledges durable enqueue before immediately importing, without duplicate imports', async () => {
    jest.useFakeTimers();
    try {
      let commit!: (value: string) => void;
      store.enqueue.mockReturnValueOnce(
        new Promise((resolve) => {
          commit = resolve;
        }),
      );
      store.claim.mockResolvedValueOnce(job).mockResolvedValue(null);
      const acceptance = service.accept(event);
      await jest.runAllTimersAsync();
      expect(store.claim).not.toHaveBeenCalled();
      commit('QUEUED');
      await acceptance;
      expect(importer.importDocument).not.toHaveBeenCalled();
      await jest.runAllTimersAsync();
      expect(importer.importDocument).toHaveBeenCalledTimes(1);
      expect(store.complete).toHaveBeenCalledWith(
        job,
        'IMPORTED',
        'owner',
        '123',
        'drive1',
      );
      store.enqueue.mockResolvedValue('DUPLICATE');
      await service.accept(event);
      await service.accept(event);
      await jest.runAllTimersAsync();
      await service.tick();
      expect(importer.importDocument).toHaveBeenCalledTimes(1);
    } finally {
      service.onModuleDestroy();
      jest.useRealTimers();
    }
  });

  it('does not lose a new event accepted while the periodic worker is processing', async () => {
    jest.useFakeTimers();
    try {
      let started!: () => void, release!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      importer.importDocument.mockImplementationOnce(async () => {
        started();
        await barrier;
        return { status: 'IMPORTED', driveFileId: 'drive1' };
      });
      const second = {
        ...job,
        event_id: 'second',
        payload: { ...event, event_id: 'second' },
      };
      store.claim
        .mockResolvedValueOnce(job)
        .mockResolvedValueOnce(second)
        .mockResolvedValue(null);
      store.enqueue.mockResolvedValue('QUEUED');
      const polling = service.tick();
      await entered;
      await service.accept(second.payload);
      await jest.runAllTimersAsync();
      expect(importer.importDocument).toHaveBeenCalledTimes(1);
      release();
      await polling;
      await jest.runAllTimersAsync();
      expect(importer.importDocument).toHaveBeenCalledTimes(2);
      expect(store.complete).toHaveBeenCalledWith(
        second,
        'IMPORTED',
        'owner',
        '123',
        'drive1',
      );
    } finally {
      service.onModuleDestroy();
      jest.useRealTimers();
    }
  });

  it('wakes question delivery only after the document and outbox transaction commits', async () => {
    businesses.find.mockResolvedValue([
      { businessNumber: '123' },
      { businessNumber: '456' },
    ]);
    let entered!: () => void, commit!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    store.waitForBusiness.mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        commit = resolve;
      });
    });
    const processing = service.process(job);
    await started;
    expect(prompts.wake).not.toHaveBeenCalled();
    commit();
    await processing;
    expect(prompts.wake).toHaveBeenCalledTimes(1);
  });

  it('never wakes question delivery if staging fails', async () => {
    businesses.find.mockResolvedValue([
      { businessNumber: '123' },
      { businessNumber: '456' },
    ]);
    store.waitForBusiness.mockRejectedValueOnce(
      new Error('fake failed commit'),
    );
    await expect(service.process(job)).rejects.toThrow();
    expect(prompts.wake).not.toHaveBeenCalled();
  });

  it('imports single-business document through existing importer with explicit owner', async () => {
    await service.process(job);
    expect(importer.importDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        firebaseId: 'owner',
        businessNumber: '123',
        source: 'API_IMPORT',
      }),
    );
    expect(store.complete).toHaveBeenCalledWith(
      job,
      'IMPORTED',
      'owner',
      '123',
      'drive1',
    );
  });
  it('processes queued documents automatically and prevents overlapping worker runs', async () => {
    let finish: (value: any) => void;
    store.claim.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const running = service.tick();
    await service.tick();
    expect(store.claim).toHaveBeenCalledTimes(1);
    finish(job);
    await running;
    expect(importer.importDocument).toHaveBeenCalled();
  });
  it('stages the multi-business question without waiting for media or importing', async () => {
    businesses.find.mockResolvedValue([
      { businessNumber: '123' },
      { businessNumber: '456' },
    ]);
    await service.process(job);
    expect(store.waitForBusiness).toHaveBeenCalledWith(
      job,
      'owner',
      expect.any(Array),
      undefined,
    );
    expect(client.download).not.toHaveBeenCalled();
    expect(prompts.wake).toHaveBeenCalledTimes(1);
    expect(importer.importDocument).not.toHaveBeenCalled();
  });
  it('downloads after an explicit business selection even when no bytes were retained', async () => {
    businesses.find.mockResolvedValue([
      { businessNumber: '123' },
      { businessNumber: '456' },
    ]);
    store.prepared.mockResolvedValue({
      firebase_id: 'owner',
      business_number: '456',
      content: null,
    });
    await service.process(job);
    expect(client.download).toHaveBeenCalledWith(
      event.message_id,
      event.event_id,
    );
    expect(store.waitForBusiness).not.toHaveBeenCalled();
    expect(importer.importDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        businessNumber: '456',
        traceEventId: event.event_id,
      }),
    );
  });
  it.each([
    'DRIVE_FOLDER_MISSING',
    'UNSUPPORTED_MEDIA_CONTENT',
    'INVALID_MEDIA_SIZE',
  ] as const)(
    'finalizes explicit blocker %s on the first attempt and wakes its notice after commit',
    async (code) => {
      store.claim.mockResolvedValueOnce(job).mockResolvedValue(null);
      const error = new DocumentImportBlockedError(code, 'test-only blocker');
      if (code === 'DRIVE_FOLDER_MISSING')
        importer.importDocument.mockRejectedValueOnce(error);
      else client.download.mockRejectedValueOnce(error);
      let committed = false;
      store.block.mockImplementationOnce(async () => {
        committed = true;
      });
      notifications.wake.mockImplementation(() => {
        if (store.block.mock.calls.length) expect(committed).toBe(true);
      });
      await service.tick();
      expect(store.block).toHaveBeenCalledWith(job, code);
      expect(store.retry).not.toHaveBeenCalled();
      expect(notifications.wake).toHaveBeenCalledTimes(2); // claim hint, then committed result
    },
  );
  it.each([400, 403, 404, 429, 500])(
    'keeps remote HTTP %s eligible for retry rather than declaring a local blocker',
    async (status) => {
      store.claim.mockResolvedValueOnce(job).mockResolvedValue(null);
      client.download.mockRejectedValueOnce({
        response: { status },
        message: 'remote error',
      });
      await service.tick();
      expect(store.retry).toHaveBeenCalledWith(job);
      expect(store.block).not.toHaveBeenCalled();
    },
  );
  it('keeps unknown and network errors retryable', async () => {
    store.claim.mockResolvedValueOnce(job).mockResolvedValue(null);
    importer.importDocument.mockRejectedValueOnce(
      Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }),
    );
    await service.tick();
    expect(store.retry).toHaveBeenCalledWith(job);
    expect(store.block).not.toHaveBeenCalled();
  });
  it('leaves recovery to the lease if committing an immediate failure fails', async () => {
    store.claim.mockResolvedValueOnce(job).mockResolvedValue(null);
    importer.importDocument.mockRejectedValueOnce(
      new DocumentImportBlockedError('DRIVE_FOLDER_MISSING', 'test-only'),
    );
    store.block.mockRejectedValueOnce(new Error('fake failed transaction'));
    await service.tick();
    expect(store.retry).not.toHaveBeenCalled();
    expect(notifications.wake).toHaveBeenCalledTimes(1);
  });
  it('rejects unknown and ambiguous senders before downloading', async () => {
    for (const matches of [[], [{ firebaseId: 'a' }, { firebaseId: 'b' }]]) {
      users.createQueryBuilder().getMany.mockResolvedValue(matches);
      await service.process(job);
    }
    expect(client.download).not.toHaveBeenCalled();
    expect(store.complete).toHaveBeenCalledWith(
      job,
      'REJECTED_ACCOUNT_MISSING',
    );
    expect(store.complete).toHaveBeenCalledWith(
      job,
      'REJECTED_ACCOUNT_AMBIGUOUS',
    );
    expect(notifications.wake).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['0501234567', 1],
    ['0547654321', 1],
    ['0501234567', 2],
    ['0547654321', 2],
  ])(
    'uses the same account businesses for %s with %s businesses',
    async (phone, count) => {
      users
        .createQueryBuilder()
        .getMany.mockResolvedValue([
          {
            firebaseId: 'owner',
            phone: '0501234567',
            spousePhone: '0547654321',
          },
        ]);
      businesses.find.mockResolvedValue(
        [{ businessNumber: '123' }, { businessNumber: '456' }].slice(
          0,
          Number(count),
        ),
      );
      const incoming = {
        ...job,
        payload: { ...event, sender_phone: null, contact_phone: phone },
      };
      await service.process(incoming);
      expect(businesses.find).toHaveBeenCalledWith({
        where: { firebaseId: 'owner' },
      });
      if (count === 1) {
        expect(importer.importDocument).toHaveBeenCalledWith(
          expect.objectContaining({
            firebaseId: 'owner',
            businessNumber: '123',
          }),
        );
        expect(store.waitForBusiness).not.toHaveBeenCalled();
      } else {
        expect(store.waitForBusiness).toHaveBeenCalledWith(
          incoming,
          'owner',
          expect.any(Array),
          undefined,
        );
        expect(importer.importDocument).not.toHaveBeenCalled();
        expect(prompts.wake).toHaveBeenCalled();
      }
    },
  );
  it('rechecks selected business ownership before importing retained content', async () => {
    store.prepared.mockResolvedValue({
      business_number: 'other',
      content: Buffer.from('%PDF-test'),
    });
    await service.process(job);
    expect(importer.importDocument).not.toHaveBeenCalled();
    expect(store.complete).toHaveBeenCalledWith(
      job,
      'REJECTED_BUSINESS',
      'owner',
    );
  });
  it('uses retained bytes for a selected business without a new media URL', async () => {
    businesses.find.mockResolvedValue([
      { businessNumber: '123' },
      { businessNumber: '456' },
    ]);
    store.prepared.mockResolvedValue({
      business_number: '456',
      content: Buffer.from('%PDF-test'),
      filename: 'x.pdf',
      mime_type: 'application/pdf',
    });
    await service.process(job);
    expect(client.download).not.toHaveBeenCalled();
    expect(importer.importDocument).toHaveBeenCalledWith(
      expect.objectContaining({ businessNumber: '456' }),
    );
  });
  it('does not acknowledge storage failure as successful intake', async () => {
    store.enqueue.mockRejectedValue(new Error('db unavailable'));
    await expect(service.accept(event)).rejects.toThrow(
      'Lychee intake storage unavailable',
    );
  });
  it('never marks failed imports as completed', async () => {
    importer.importDocument.mockResolvedValue({
      status: 'SKIPPED',
      driveFileId: null,
    });
    await expect(service.process(job)).rejects.toThrow();
    expect(store.complete).not.toHaveBeenCalled();
  });
});
