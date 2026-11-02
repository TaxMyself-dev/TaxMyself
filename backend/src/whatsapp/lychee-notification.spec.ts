import { LycheeEventStore } from './lychee-event.store';
import {
  documentResult,
  LycheeNotificationStore,
  resultHash,
  commitDocumentResults,
} from './lychee-notification.store';
import {
  LycheeNotificationService,
  NoSendNotificationTransport,
  LycheeNotificationTransport,
} from './lychee-notification.service';
import { LycheeModule } from './lychee.module';
import { DevelopmentOnlyPromptTransport } from './lychee-prompt.transport';
import * as logging from './lychee-log';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const event: any = {
  event: 'message.received',
  event_id: 'test-document',
  channel_id: 'test-channel',
  message_id: 'test-message',
  whatsapp_message_id: 'wamid.test-document',
  has_media: true,
  message_type: 'document',
  sender_phone: null,
  contact_phone: '0501234567',
};
const job: any = {
  event_id: event.event_id,
  payload: event,
  lease_token: 'test-lease',
  attempts: 1,
};

/** Fake SQL/transactions only; rejects unimplemented statements and never opens a connection. */
class MemoryDb {
  rows = new Map<string, any>();
  failInsert = false;
  failReceipts = 0;
  loseReceiptAcknowledgment = false;
  failSent = false;
  query = jest.fn(async (sql: string, args: any[] = []) =>
    this.execute(this.rows, sql, args),
  );
  createQueryRunner() {
    const rows = new Map([...this.rows].map(([id, row]) => [id, copy(row)]));
    const runner: any = {
      isTransactionActive: false,
      connect: jest.fn(async () => undefined),
      startTransaction: jest.fn(async () => {
        runner.isTransactionActive = true;
      }),
      query: async (sql: string, args: any[] = []) =>
        this.execute(rows, sql, args),
      commitTransaction: jest.fn(async () => {
        this.rows = rows;
        runner.isTransactionActive = false;
      }),
      rollbackTransaction: jest.fn(async () => {
        runner.isTransactionActive = false;
      }),
      release: jest.fn(async () => undefined),
    };
    return runner;
  }
  private execute(rows: Map<string, any>, sql: string, p: any[]): any {
    const q = sql.replace(/\s+/g, ' ').trim();
    const all = [...rows.values()];
    if (q.startsWith('INSERT INTO') && q.includes("'NOTICE_PENDING'")) {
      if (this.failInsert) throw new Error('fake outbox unavailable');
      if (!rows.has(p[0]))
        rows.set(p[0], {
          event_id: p[0],
          channel_id: p[1],
          message_id: p[2],
          sender_phone: p[3],
          payload: JSON.parse(p[4]),
          payload_hash: p[5],
          status: 'NOTICE_PENDING',
          firebase_id: p[6],
          business_number: p[7],
          attempts: 0,
          ready: true,
        });
      return { affectedRows: 1 };
    }
    if (q.startsWith('SELECT event_id FROM') && q.includes('attempts >= 5'))
      return all
        .filter(
          (r) => r.status === 'PROCESSING' && r.expired && r.attempts >= 5,
        )
        .slice(0, 25)
        .map((r) => ({ event_id: r.event_id }));
    if (q.startsWith('SELECT') && q.includes('WHERE lease_token=?'))
      return copy(all.filter((r) => r.lease_token === p[0]));
    if (q.startsWith('SELECT') && q.includes('WHERE event_id=?')) {
      const row = rows.get(p[0]);
      return row && (!q.includes('AND channel_id=?') || row.channel_id === p[1])
        ? [copy(row)]
        : [];
    }
    if (q.startsWith('SELECT') && q.includes('prompt_whatsapp_message_id=?')) {
      return copy(
        all
          .filter(
            (r) =>
              r.channel_id === p[0] &&
              r.sender_phone === p[1] &&
              r.firebase_id === p[2] &&
              r.prompt_whatsapp_message_id === p[3],
          )
          .slice(0, 2),
      );
    }
    if (q.includes("SET status='BUSINESS_LOCKED',firebase_id=?")) {
      const r = rows.get(p[3]);
      if (!r || r.lease_token !== p[4]) return { affectedRows: 0 };
      Object.assign(r, {
        status: 'BUSINESS_LOCKED',
        firebase_id: p[0],
        business_number: p[1],
        business_choices: JSON.parse(p[2]),
        lease_token: null,
      });
      return { affectedRows: 1 };
    }
    if (q.includes("SET status='FAILED'") && q.includes('LEASE_EXPIRED')) {
      const r = rows.get(p[0]);
      if (!r || r.status !== 'PROCESSING' || !r.expired || r.attempts < 5)
        return { affectedRows: 0 };
      Object.assign(r, {
        status: 'FAILED',
        last_error: 'LEASE_EXPIRED',
        lease_token: null,
      });
      return { affectedRows: 1 };
    }
    if (q.includes("SET status='BLOCKED_IMPORT',last_error=?")) {
      const r = rows.get(p[1]);
      if (!r || r.lease_token !== p[2]) return { affectedRows: 0 };
      Object.assign(r, {
        status: 'BLOCKED_IMPORT',
        last_error: p[0],
        lease_token: null,
      });
      return { affectedRows: 1 };
    }
    if (q.startsWith('UPDATE') && q.includes('SET status=?, firebase_id=?')) {
      const r = rows.get(p[4]);
      if (!r || r.lease_token !== p[5]) return { affectedRows: 0 };
      Object.assign(r, {
        status: p[0],
        firebase_id: p[1],
        business_number: p[2],
        drive_file_id: p[3],
        content: null,
        lease_token: null,
      });
      return { affectedRows: 1 };
    }
    if (q.startsWith('UPDATE') && q.includes("last_error='INTAKE_FAILED'")) {
      const r = rows.get(p[1]);
      if (!r || r.lease_token !== p[2]) return { affectedRows: 0 };
      Object.assign(r, {
        status: p[0],
        last_error: 'INTAKE_FAILED',
        lease_token: null,
      });
      return { affectedRows: 1 };
    }
    if (q.includes("SET status='PROCESSING'")) {
      const row = all.find(
        (r) =>
          (['PENDING', 'RETRY'].includes(r.status) && r.ready) ||
          (r.status === 'PROCESSING' && r.expired && r.attempts < 5),
      );
      if (row)
        Object.assign(row, {
          status: 'PROCESSING',
          lease_token: p[0],
          attempts: row.attempts + 1,
          expired: false,
        });
      return { affectedRows: row ? 1 : 0 };
    }
    if (q.includes("SET status='NOTICE_UNKNOWN'")) {
      for (const r of all)
        if (r.status === 'NOTICE_SENDING' && r.expired)
          Object.assign(r, { status: 'NOTICE_UNKNOWN', lease_token: null });
      return {};
    }
    if (q.includes("SET status='NOTICE_RECORD'")) {
      for (const r of all)
        if (
          (r.status === 'NOTICE_RECORDING' && r.expired) ||
          (q.includes("status='NOTICE_UNKNOWN'") &&
            r.status === 'NOTICE_UNKNOWN' &&
            r.payload.providerMessageId)
        )
          Object.assign(r, { status: 'NOTICE_RECORD', lease_token: null });
      return {};
    }
    if (q.includes("WHEN status='NOTICE_RECORD'")) {
      const r = all.find(
        (r) =>
          ['NOTICE_PENDING', 'NOTICE_RECORD'].includes(r.status) && r.ready,
      );
      if (r)
        Object.assign(r, {
          status:
            r.status === 'NOTICE_RECORD'
              ? 'NOTICE_RECORDING'
              : 'NOTICE_SENDING',
          lease_token: p[0],
          expired: false,
          attempts: r.attempts + 1,
        });
      return { affectedRows: r ? 1 : 0 };
    }
    if (q.includes("payload=JSON_SET(payload,'$.providerMessageId'")) {
      if (this.failReceipts-- > 0) throw new Error('fake receipt write failed');
      const r = rows.get(p[1]);
      if (
        !r ||
        r.lease_token !== p[2] ||
        !['NOTICE_SENDING', 'NOTICE_RECORDING'].includes(r.status) ||
        (r.payload.providerMessageId && r.payload.providerMessageId !== p[3])
      )
        return { affectedRows: 0 };
      r.payload.providerMessageId = p[0];
      r.status = 'NOTICE_RECORDING';
      if (this.loseReceiptAcknowledgment) {
        this.loseReceiptAcknowledgment = false;
        throw new Error('fake lost acknowledgment');
      }
      return { affectedRows: 1 };
    }
    if (q.includes('SET status=?,last_error=?')) {
      if (p[0] === 'NOTICE_SENT' && this.failSent) {
        this.failSent = false;
        throw new Error('fake finish failed');
      }
      const r = rows.get(p[2]);
      if (!r || r.lease_token !== p[3]) return { affectedRows: 0 };
      Object.assign(r, {
        status: p[0],
        last_error: p[1],
        lease_token: null,
        ready: false,
      });
      return { affectedRows: 1 };
    }
    throw new Error('Unimplemented fake SQL: ' + q);
  }
}

describe('document result notifications (all boundaries mocked)', () => {
  let db: MemoryDb, events: LycheeEventStore, outbox: LycheeNotificationStore;
  let transport: any,
    users: any,
    businesses: any,
    service: LycheeNotificationService;
  const notice = () =>
    [...db.rows.values()].find((r) => r.event_id.startsWith('notice:'));
  const parent = () => db.rows.get(event.event_id);
  function repeatChoice(label = '2. שובל') {
    Object.assign(parent(), {
      status: 'IMPORTED',
      firebase_id: 'test-owner',
      business_number: 'test-business',
      drive_file_id: 'original-drive-file',
      prompt_whatsapp_message_id: 'wamid.test-question',
      business_choices: [
        { businessNumber: 'test-business', name: 'נגרות', label: '1. נגרות' },
        { businessNumber: 'other-business', name: 'שובל', label: '2. שובל' },
      ],
    });
    const reply = {
      ...event,
      event_id: 'test-repeat',
      message_id: 'test-repeat-message',
      whatsapp_message_id: 'wamid.test-repeat',
      has_media: false,
      message_type: 'text',
      text: label,
      reply_to_whatsapp_message_id: 'wamid.test-question',
    };
    const replyJob = { ...job, event_id: reply.event_id, payload: reply };
    db.rows.set(reply.event_id, {
      ...copy(replyJob),
      channel_id: event.channel_id,
      message_id: reply.message_id,
      sender_phone: '972501234567',
      status: 'PROCESSING',
      firebase_id: null,
      business_number: null,
      drive_file_id: null,
    });
    return replyJob;
  }
  const succeed = async (status = 'IMPORTED') =>
    events.complete(
      job,
      status,
      'test-owner',
      'test-business',
      'test-drive-file',
    );
  beforeEach(() => {
    db = new MemoryDb();
    db.rows.set(event.event_id, {
      ...copy(job),
      channel_id: event.channel_id,
      message_id: event.message_id,
      sender_phone: '972501234567',
      status: 'PROCESSING',
      firebase_id: null,
      business_number: null,
      drive_file_id: null,
      expired: false,
    });
    events = new LycheeEventStore(db as any);
    outbox = new LycheeNotificationStore(db as any);
    transport = {
      available: true,
      send: jest.fn(async () => 'wamid.test-notification'),
    };
    const qb = {
      where: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [{ firebaseId: 'test-owner' }]),
    };
    users = { createQueryBuilder: jest.fn(() => qb) };
    businesses = {
      findOne: jest.fn(async () => ({ businessNumber: 'test-business' })),
    };
    service = new LycheeNotificationService(
      outbox,
      transport,
      users,
      businesses,
    );
  });
  afterEach(() => service.onModuleDestroy());
  it.each(['1. נגרות', '2. שובל'])(
    'explains an already selected business for repeat choice %s without modifying the document',
    async (label) => {
      const reply = repeatChoice(label);
      const original = copy(parent());
      expect(await events.explainSelectedBusiness(reply, 'test-owner')).toBe(
        true,
      );
      expect(parent()).toEqual(original);
      expect(db.rows.get(reply.event_id).status).toBe('BUSINESS_LOCKED');
      expect(notice().payload.request.text).toContain('כבר שויך לעסק נגרות');
      expect(notice().payload.request.text).toContain('שלח אותו מחדש');
      expect(notice().payload.request.text).not.toContain('לעסק שובל');
      expect(notice().payload.request.reply_to_whatsapp_message_id).toBe(
        event.whatsapp_message_id,
      );
      await service.tick();
      await service.tick();
      expect(transport.send).toHaveBeenCalledTimes(1);
      expect(parent()).toEqual(original);
      expect(notice().status).toBe('NOTICE_SENT');
      await expect(
        events.explainSelectedBusiness(reply, 'test-owner'),
      ).rejects.toThrow('lease');
      expect(
        [...db.rows.keys()].filter((k) => k.startsWith('notice:')),
      ).toHaveLength(1);
    },
  );
  it('rolls back repeat-reply completion if its explanation draft cannot be persisted', async () => {
    const reply = repeatChoice();
    const original = copy(parent());
    db.failInsert = true;
    await expect(
      events.explainSelectedBusiness(reply, 'test-owner'),
    ).rejects.toThrow();
    expect(db.rows.get(reply.event_id).status).toBe('PROCESSING');
    expect(parent()).toEqual(original);
    expect(notice()).toBeUndefined();
  });
  it.each(['owner', 'sender', 'quote', 'label', 'waiting', 'ambiguous'])(
    'does not stage an explanation for an unsafe repeat: %s',
    async (reason) => {
      const reply = repeatChoice();
      if (reason === 'owner') parent().firebase_id = 'another-owner';
      if (reason === 'sender') parent().sender_phone = '972509999999';
      if (reason === 'quote')
        reply.payload.reply_to_whatsapp_message_id = 'other-question';
      if (reason === 'label') reply.payload.text = 'unrelated text';
      if (reason === 'waiting') parent().status = 'WAITING_FOR_BUSINESS';
      if (reason === 'ambiguous')
        db.rows.set('ambiguous-parent', {
          ...copy(parent()),
          event_id: 'ambiguous-parent',
        });
      expect(await events.explainSelectedBusiness(reply, 'test-owner')).toBe(
        false,
      );
      expect(notice()).toBeUndefined();
      expect(transport.send).not.toHaveBeenCalled();
    },
  );
  it('rechecks the original assignment before delivering the explanation', async () => {
    const reply = repeatChoice();
    await events.explainSelectedBusiness(reply, 'test-owner');
    parent().business_number = 'other-business';
    await service.tick();
    expect(notice().status).toBe('NOTICE_CANCELLED');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it.each(['IMPORTED', 'ALREADY_IMPORTED'])(
    'stages %s atomically, quotes the source and reports the chosen business',
    async (status) => {
      await succeed(status);
      expect(parent().status).toBe(status);
      expect(notice().status).toBe('NOTICE_PENDING');
      expect(notice().payload.request).toMatchObject({
        phone: '972501234567',
        reply_to_whatsapp_message_id: event.whatsapp_message_id,
      });
      expect(notice().payload.request.text).toContain('test-business');
      if (status === 'ALREADY_IMPORTED')
        expect(notice().payload.request.text).toContain('לא נוצר עותק נוסף');
      await service.tick();
      await service.tick();
      expect(transport.send).toHaveBeenCalledTimes(1);
      expect(transport.send.mock.calls[0][1]).toBe(notice().event_id);
      expect(notice().payload.providerMessageId).toBe(
        'wamid.test-notification',
      );
      expect(notice().status).toBe('NOTICE_SENT');
      expect(notice().prompt_whatsapp_message_id).toBeUndefined();
    },
  );
  it('rolls back document completion if outbox persistence fails', async () => {
    db.failInsert = true;
    await expect(succeed()).rejects.toThrow();
    expect(parent().status).toBe('PROCESSING');
    expect(notice()).toBeUndefined();
    db.failInsert = false;
    await succeed();
    expect(notice().status).toBe('NOTICE_PENDING');
  });
  it('uses a deterministic outbox ID and refuses a conflicting immutable draft', async () => {
    await succeed();
    const id = notice().event_id;
    await commitDocumentResults(db as any, async () => [event.event_id]);
    expect([...db.rows.keys()].filter((k) => k.startsWith('notice:'))).toEqual([
      id,
    ]);
    notice().payload_hash = 'tampered';
    await expect(
      commitDocumentResults(db as any, async () => [event.event_id]),
    ).rejects.toThrow('conflict');
  });
  it('refuses a stale document lease without staging a notification', async () => {
    parent().lease_token = 'someone-else';
    await expect(succeed()).rejects.toThrow('lease');
    expect(notice()).toBeUndefined();
  });
  it('does not announce transient retry, waiting, unsupported routing or a text reply', async () => {
    await events.retry(job);
    expect(parent().status).toBe('RETRY');
    expect(notice()).toBeUndefined();
    for (const status of [
      'WAITING_FOR_BUSINESS',
      'BUSINESS_SELECTED',
      'IGNORED',
      'REJECTED_SENDER',
    ]) {
      Object.assign(parent(), {
        status: 'PROCESSING',
        lease_token: job.lease_token,
      });
      await events.complete(job, status);
      expect(notice()).toBeUndefined();
    }
    expect(
      documentResult({
        ...parent(),
        status: 'FAILED',
        payload: { ...event, has_media: false },
      }),
    ).toBeNull();
  });
  it('stages a final failure once after attempt five, without pretending no file exists', async () => {
    await events.retry({ ...job, attempts: 5 });
    expect(parent().status).toBe('FAILED');
    expect(notice().payload.result).toBe('FAILED');
    expect(notice().payload.request.text).toContain('לא הצלחנו להשלים');
    await service.tick();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it.each([
    'DRIVE_FOLDER_MISSING',
    'UNSUPPORTED_MEDIA_CONTENT',
    'INVALID_MEDIA_SIZE',
  ] as const)(
    'commits first-attempt blocker %s with a specific notice and sends only one simulated result',
    async (code) => {
      await events.block(job, code);
      expect(parent().status).toBe('BLOCKED_IMPORT');
      expect(parent().attempts).toBe(1);
      expect(notice().payload.result).toBe('BLOCKED_IMPORT');
      expect(notice().payload.request.text).not.toContain('כמה ניסיונות');
      if (code === 'DRIVE_FOLDER_MISSING')
        expect(notice().payload.request.text).toContain('תיק המסמכים');
      if (code === 'UNSUPPORTED_MEDIA_CONTENT')
        expect(notice().payload.request.text).toContain('PDF');
      await service.tick();
      await service.tick();
      expect(transport.send).toHaveBeenCalledTimes(1);
      expect(notice().status).toBe('NOTICE_SENT');
    },
  );
  it('rolls back an immediate blocker if its outbox draft cannot be saved', async () => {
    db.failInsert = true;
    await expect(events.block(job, 'DRIVE_FOLDER_MISSING')).rejects.toThrow();
    expect(parent().status).toBe('PROCESSING');
    expect(parent().lease_token).toBe(job.lease_token);
    expect(notice()).toBeUndefined();
  });
  it('refuses a stale lease when finalizing a blocker', async () => {
    parent().lease_token = 'another-worker';
    await expect(events.block(job, 'DRIVE_FOLDER_MISSING')).rejects.toThrow(
      'lease',
    );
    expect(notice()).toBeUndefined();
  });
  it('reports a terminal business rejection to a verified account without claiming an import', async () => {
    await events.complete(job, 'REJECTED_BUSINESS', 'test-owner');
    expect(notice().payload.result).toBe('REJECTED_BUSINESS');
    expect(notice().payload.request.text).toContain('לא הצלחנו לשייך');
    await service.tick();
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(businesses.findOne).not.toHaveBeenCalled();
    expect(parent().drive_file_id).toBeNull();
  });
  it('rolls back terminal failure if staging fails; expired final leases also stage failure', async () => {
    db.failInsert = true;
    await expect(events.retry({ ...job, attempts: 5 })).rejects.toThrow();
    expect(parent().status).toBe('PROCESSING');
    Object.assign(parent(), { attempts: 5, expired: true });
    db.failInsert = false;
    expect(await events.claim()).toBeNull();
    expect(parent().last_error).toBe('LEASE_EXPIRED');
    expect(notice().status).toBe('NOTICE_PENDING');
  });
  it('does not notify success without a verified Drive result or a valid source quote', async () => {
    expect(documentResult({ ...parent(), status: 'IMPORTED' })).toBeNull();
    parent().payload.whatsapp_message_id = '';
    await succeed();
    expect(notice()).toBeUndefined();
  });
  it.each([
    'unknown',
    'ambiguous',
    'changed',
    'business',
    'result',
    'tampered',
  ])('cancels unsafe preflight: %s', async (reason) => {
    await succeed();
    const qb = users.createQueryBuilder();
    if (reason === 'unknown') qb.getMany.mockResolvedValue([]);
    if (reason === 'ambiguous')
      qb.getMany.mockResolvedValue([
        { firebaseId: 'test-owner' },
        { firebaseId: 'other' },
      ]);
    if (reason === 'changed')
      qb.getMany.mockResolvedValue([{ firebaseId: 'other' }]);
    if (reason === 'business') businesses.findOne.mockResolvedValue(null);
    if (reason === 'result') parent().status = 'RETRY';
    if (reason === 'tampered') notice().payload.request.text = 'modified';
    await service.tick();
    expect(notice().status).toBe('NOTICE_CANCELLED');
    expect(transport.send).not.toHaveBeenCalled();
  });
  it('retries preflight storage failures before HTTP, never treating them as delivery', async () => {
    await succeed();
    const read = jest
      .spyOn(outbox, 'parent')
      .mockRejectedValueOnce(new Error('fake db down'));
    await service.tick();
    expect(notice().status).toBe('NOTICE_PENDING');
    expect(transport.send).not.toHaveBeenCalled();
    read.mockRestore();
    notice().ready = true;
    await service.tick();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it('quarantines uncertain sends and never blindly resends them', async () => {
    await succeed();
    transport.send.mockRejectedValueOnce(
      new Error('fake timeout after acceptance'),
    );
    await service.tick();
    expect(notice().status).toBe('NOTICE_UNKNOWN');
    notice().expired = true;
    notice().ready = true;
    await service.tick();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it('logs provider failure metadata without request bodies, phones or credentials', async () => {
    await succeed();
    const log = jest
      .spyOn(logging, 'lycheeLog')
      .mockImplementation(() => undefined);
    const previous = process.env.LYCHEE_API_KEY;
    process.env.LYCHEE_API_KEY = 'synthetic-notification-secret';
    try {
      transport.send.mockRejectedValueOnce({
        response: {
          status: 403,
          data: { error: 'synthetic-notification-secret 972501234567 denied' },
        },
        config: {
          headers: { Authorization: 'Bearer synthetic-notification-secret' },
          data: notice().payload.request,
        },
      });
      await service.tick();
      const entries = JSON.stringify(log.mock.calls);
      expect(entries).toContain('403');
      expect(entries).toContain('notification.send');
      for (const secret of [
        'synthetic-notification-secret',
        '972501234567',
        'test-business',
        'wamid.test-document',
      ])
        expect(entries).not.toContain(secret);
    } finally {
      if (previous === undefined) delete process.env.LYCHEE_API_KEY;
      else process.env.LYCHEE_API_KEY = previous;
      log.mockRestore();
    }
  });
  it.each(['failed-write', 'lost-ack'])(
    'retries only receipt persistence: %s',
    async (mode) => {
      await succeed();
      if (mode === 'failed-write') db.failReceipts = 1;
      else db.loseReceiptAcknowledgment = true;
      await service.tick();
      expect(notice().status).toBe('NOTICE_SENT');
      expect(transport.send).toHaveBeenCalledTimes(1);
    },
  );
  it('after a recorded receipt, retries final status only, even across service restart', async () => {
    await succeed();
    db.failSent = true;
    await service.tick();
    expect(notice().status).toBe('NOTICE_RECORD');
    expect(notice().payload.providerMessageId).toBeTruthy();
    notice().ready = true;
    service.onModuleDestroy();
    service = new LycheeNotificationService(
      outbox,
      transport,
      users,
      businesses,
    );
    await service.tick();
    expect(notice().status).toBe('NOTICE_SENT');
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it('recovers expired recorded receipts without HTTP but quarantines expired in-flight requests', async () => {
    await succeed();
    const claimed = await outbox.claim();
    notice().expired = true;
    await service.tick();
    expect(notice().status).toBe('NOTICE_UNKNOWN');
    expect(transport.send).not.toHaveBeenCalled();
    Object.assign(notice(), {
      status: 'NOTICE_RECORDING',
      expired: true,
      ready: true,
      payload: {
        ...claimed!.payload,
        providerMessageId: 'wamid.test-existing',
      },
    });
    await service.tick();
    expect(notice().status).toBe('NOTICE_SENT');
    expect(transport.send).not.toHaveBeenCalled();
  });
  it('two workers competing for one notice produce one transport call', async () => {
    await succeed();
    const other = new LycheeNotificationService(
      outbox,
      transport,
      users,
      businesses,
    );
    try {
      await Promise.all([service.tick(), other.tick()]);
    } finally {
      other.onModuleDestroy();
    }
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it('does not backfill old completed rows just by polling', async () => {
    Object.assign(parent(), {
      status: 'IMPORTED',
      firebase_id: 'test-owner',
      business_number: 'test-business',
      drive_file_id: 'test-drive',
    });
    await service.tick();
    expect(notice()).toBeUndefined();
    expect(transport.send).not.toHaveBeenCalled();
  });
  it('binds result delivery to the development guard and retains an offline transport for tests', async () => {
    const providers = Reflect.getMetadata('providers', LycheeModule);
    expect(providers).toContainEqual({
      provide: LycheeNotificationTransport,
      useClass: DevelopmentOnlyPromptTransport,
    });
    await succeed();
    service.onModuleDestroy();
    const blocked = new NoSendNotificationTransport();
    service = new LycheeNotificationService(outbox, blocked, users, businesses);
    db.query.mockClear();
    service.wake();
    await service.tick();
    expect(db.query).not.toHaveBeenCalled();
    expect(notice().status).toBe('NOTICE_PENDING');
    await expect(blocked.send()).rejects.toThrow('not authorized');
  });
});
