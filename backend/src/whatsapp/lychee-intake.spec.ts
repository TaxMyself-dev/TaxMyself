import { createHmac } from 'crypto';
import { parseLycheeEvent } from './lychee-webhook.controller';
import { detectLycheeMime } from './lychee-client.service';
import { LycheeEventStore } from './lychee-event.store';
import { LycheeIntakeService } from './lychee-intake.service';
import { lycheeSender } from './lychee-sender';

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
  it('accepts absent sender with local contact phone, but rejects malformed or conflicting sender', () => {
    for (const sender_phone of [null, undefined, '', '  ']) {
      const input = { ...event, sender_phone, contact_phone: '0501234567' };
      const bytes = Buffer.from(JSON.stringify(input));
      const sig = 'sha256=' + createHmac('sha256', 'secret').update(bytes).digest('hex');
      expect(lycheeSender(parseLycheeEvent(bytes, sig, 'secret', 'channel1'))).toBe('972501234567');
    }
    expect(lycheeSender({ sender_phone: 'bad', contact_phone: '0501234567' })).toBeNull();
    expect(lycheeSender({ sender_phone: '0541234567', contact_phone: '0501234567' })).toBeNull();
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
    await expect(store.enqueue(event)).resolves.toBeUndefined();
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
});

describe('Lychee document workflow without sending', () => {
  let store: any,
    client: any,
    importer: any,
    users: any,
    businesses: any,
    service: LycheeIntakeService;
  beforeEach(() => {
    store = {
      complete: jest.fn(),
      waitForBusiness: jest.fn(),
      prepared: jest.fn().mockResolvedValue({}),
      enqueue: jest.fn(),
      selectBusiness: jest.fn().mockResolvedValue(false),
      claim: jest.fn(),
      retry: jest.fn(),
    };
    client = {
      download: jest
        .fn()
        .mockResolvedValue({
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
    service = new LycheeIntakeService(
      store,
      client,
      importer,
      users,
      businesses,
    );
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
  it('stores multi-business bytes separately without uploading or sending', async () => {
    businesses.find.mockResolvedValue([
      { businessNumber: '123' },
      { businessNumber: '456' },
    ]);
    await service.process(job);
    expect(store.waitForBusiness).toHaveBeenCalledWith(
      job,
      'owner',
      expect.any(Array),
      expect.objectContaining({ content: expect.any(Buffer) }),
    );
    expect(importer.importDocument).not.toHaveBeenCalled();
  });
  it('rejects unknown and ambiguous senders before downloading', async () => {
    for (const matches of [[], [{ firebaseId: 'a' }, { firebaseId: 'b' }]]) {
      users.createQueryBuilder().getMany.mockResolvedValue(matches);
      await service.process(job);
    }
    expect(client.download).not.toHaveBeenCalled();
    expect(store.complete).toHaveBeenCalledWith(job, 'REJECTED_SENDER');
  });
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
    await expect(service.process(job)).rejects.toThrow('Import failed');
    expect(store.complete).not.toHaveBeenCalled();
  });
});
