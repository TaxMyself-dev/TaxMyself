import { buildBusinessQuestion } from './lychee-business-question';
import { LycheeEventStore } from './lychee-event.store';
import {
  LycheePromptStore,
  promptEventId,
  promptHash,
} from './lychee-prompt.store';
import { LycheePromptService } from './lychee-prompt.service';
import {
  LycheePromptTransport,
  NoSendPromptTransport,
  LycheeHttpPromptTransport,
  DevelopmentOnlyPromptTransport,
} from './lychee-prompt.transport';
import { LycheeModule } from './lychee.module';
import { Logger } from '@nestjs/common';
import { PromptDeliveryError } from './lychee-prompt-diagnostic';

/** Offline SQL boundary with fault injection; never opens a connection. */
class MemoryDb {
  rows = new Map<string, any>();
  queries = 0;
  failInsert = false;
  failReceipt = 0;
  failReceiptAfterCommit = 0;
  failLink = 0;
  failSent = 0;
  clone() {
    return new Map(
      [...this.rows].map(([key, row]) => [
        key,
        {
          ...row,
          payload: JSON.parse(JSON.stringify(row.payload)),
          business_choices:
            row.business_choices &&
            JSON.parse(JSON.stringify(row.business_choices)),
        },
      ]),
    );
  }
  createQueryRunner() {
    const db = this;
    let snapshot: Map<string, any>;
    return {
      isTransactionActive: false,
      async connect() {},
      async release() {},
      async startTransaction() {
        snapshot = db.clone();
        this.isTransactionActive = true;
      },
      async commitTransaction() {
        this.isTransactionActive = false;
      },
      async rollbackTransaction() {
        db.rows = snapshot;
        this.isTransactionActive = false;
      },
      query: (sql: string, args?: any[]) => db.query(sql, args),
    };
  }
  async query(sql: string, args: any[] = []): Promise<any> {
    this.queries++;
    const rows = [...this.rows.values()];
    if (sql.includes("SET status='WAITING_FOR_BUSINESS'")) {
      const row = this.rows.get(args[5]);
      if (!row || row.lease_token !== args[6]) return { affectedRows: 0 };
      Object.assign(row, {
        status: 'WAITING_FOR_BUSINESS',
        firebase_id: args[0],
        business_choices: JSON.parse(args[1]),
        content: args[2],
        filename: args[3],
        mime_type: args[4],
        lease_token: null,
      });
      return { affectedRows: 1 };
    }
    if (sql.startsWith('INSERT')) {
      if (this.failInsert) throw new Error('SQL insert failed');
      const [
        event_id,
        channel_id,
        message_id,
        sender_phone,
        payload,
        payload_hash,
        firebase_id,
      ] = args;
      if (!this.rows.has(event_id))
        this.rows.set(event_id, {
          event_id,
          channel_id,
          message_id,
          sender_phone,
          payload: JSON.parse(payload),
          payload_hash,
          firebase_id,
          status: 'PROMPT_PENDING',
          lease_token: null,
          attempts: 0,
        });
      return { affectedRows: 1 };
    }
    if (sql.includes("WHERE status='PROMPT_SENDING' AND lease_until")) {
      rows
        .filter((r) => r.status === 'PROMPT_SENDING' && r.expired)
        .forEach((r) =>
          Object.assign(r, { status: 'PROMPT_UNKNOWN', lease_token: null }),
        );
      return {};
    }
    if (sql.includes("WHERE status='PROMPT_LINKING' AND lease_until")) {
      rows
        .filter((r) => r.status === 'PROMPT_LINKING' && r.expired)
        .forEach((r) =>
          Object.assign(r, { status: 'PROMPT_LINK', lease_token: null }),
        );
      return {};
    }
    if (sql.includes("WHERE status='PROMPT_UNKNOWN'")) {
      rows
        .filter(
          (r) => r.status === 'PROMPT_UNKNOWN' && r.payload.providerMessageId,
        )
        .forEach((r) => {
          r.status = 'PROMPT_LINK';
        });
      return {};
    }
    if (sql.includes('status=CASE')) {
      const row = rows.find((r) =>
        ['PROMPT_PENDING', 'PROMPT_LINK'].includes(r.status),
      );
      if (!row) return { affectedRows: 0 };
      Object.assign(row, {
        status:
          row.status === 'PROMPT_LINK' ? 'PROMPT_LINKING' : 'PROMPT_SENDING',
        lease_token: args[0],
        expired: false,
        attempts: row.attempts + 1,
      });
      return { affectedRows: 1 };
    }
    if (sql.includes('SET payload=JSON_SET')) {
      if (this.failReceipt-- > 0) throw new Error('Receipt SQL failed');
      const row = this.rows.get(args[1]);
      if (
        !row ||
        row.lease_token !== args[2] ||
        !['PROMPT_SENDING', 'PROMPT_LINKING'].includes(row.status) ||
        (row.payload.providerMessageId &&
          row.payload.providerMessageId !== args[0])
      )
        return { affectedRows: 0 };
      row.payload.providerMessageId = args[0];
      row.status = 'PROMPT_LINKING';
      if (this.failReceiptAfterCommit-- > 0)
        throw new Error('Receipt committed but response lost');
      return { affectedRows: 1 };
    }
    if (sql.includes('SET prompt_whatsapp_message_id=?')) {
      if (this.failLink-- > 0) throw new Error('Link SQL failed');
      const row = this.rows.get(args[1]);
      if (
        !row ||
        row.channel_id !== args[2] ||
        row.firebase_id !== args[3] ||
        row.status !== 'WAITING_FOR_BUSINESS' ||
        (row.prompt_whatsapp_message_id &&
          row.prompt_whatsapp_message_id !== args[0])
      )
        return { affectedRows: 0 };
      row.prompt_whatsapp_message_id = args[0];
      return { affectedRows: 1 };
    }
    if (sql.includes('SET status=?,last_error=?')) {
      if (args[0] === 'PROMPT_SENT' && this.failSent-- > 0)
        throw new Error('Completion SQL failed');
      const row = this.rows.get(args[2]);
      if (!row || row.lease_token !== args[3]) return { affectedRows: 0 };
      Object.assign(row, {
        status: args[0],
        last_error: args[1],
        lease_token: null,
      });
      return { affectedRows: 1 };
    }
    if (sql.includes('SET business_number=?')) {
      const row = this.rows.get(args[1]);
      if (!row || row.status !== 'WAITING_FOR_BUSINESS')
        return { affectedRows: 0 };
      Object.assign(row, { business_number: args[0], status: 'PENDING' });
      return { affectedRows: 1 };
    }
    if (sql.includes('WHERE lease_token=?'))
      return rows
        .filter((r) => r.lease_token === args[0])
        .map((r) => ({ ...r, payload: JSON.parse(JSON.stringify(r.payload)) }));
    if (sql.startsWith('SELECT payload_hash'))
      return rows.filter((r) => r.event_id === args[0]);
    if (sql.startsWith('SELECT prompt_whatsapp_message_id'))
      return rows.filter(
        (r) =>
          r.event_id === args[0] &&
          r.channel_id === args[1] &&
          r.firebase_id === args[2],
      );
    if (sql.startsWith('SELECT event_id, business_choices'))
      return rows.filter(
        (r) =>
          r.channel_id === args[0] &&
          r.sender_phone === args[1] &&
          r.firebase_id === args[2] &&
          r.prompt_whatsapp_message_id === args[3] &&
          r.status === 'WAITING_FOR_BUSINESS',
      );
    if (sql.includes('WHERE event_id=? AND channel_id=? AND firebase_id=?'))
      return rows.filter(
        (r) =>
          r.event_id === args[0] &&
          r.channel_id === args[1] &&
          r.firebase_id === args[2],
      );
    throw new Error('Unexpected SQL in offline test');
  }
}

describe('Durable business question delivery — fake database and fake transport only', () => {
  let db: MemoryDb,
    events: LycheeEventStore,
    outbox: LycheePromptStore,
    transport: any,
    users: any,
    businesses: any;
  const doc = (id: string) => ({
    event: 'message.received' as const,
    event_id: id,
    channel_id: 'channel',
    message_id: 'msg-' + id,
    whatsapp_message_id: 'document-' + id,
    contact_phone: '0501234567',
    sender_phone: null,
    has_media: true,
    message_type: 'document',
    text: '[מסמך]',
    reply_to_whatsapp_message_id: null,
  });
  const makeService = (t = transport) =>
    new LycheePromptService(outbox, events, t, users, businesses);
  const journal = (id = 'doc') => db.rows.get(promptEventId('channel', id));
  async function stage(id = 'doc') {
    const payload = doc(id);
    const job = {
      event_id: id,
      payload,
      lease_token: 'lease-' + id,
      attempts: 1,
    };
    db.rows.set(id, {
      event_id: id,
      channel_id: 'channel',
      sender_phone: '972501234567',
      payload,
      status: 'PROCESSING',
      lease_token: job.lease_token,
    });
    const { choices } = buildBusinessQuestion(payload, '972501234567', [
      { businessNumber: '123', businessName: 'נגרות' },
      { businessNumber: '456', businessName: 'ייעוץ' },
    ]);
    await events.waitForBusiness(job, 'owner', choices, {
      content: Buffer.from('%PDF-test'),
      filename: 'test.pdf',
      mimeType: 'application/pdf',
    });
    return job;
  }
  beforeEach(() => {
    db = new MemoryDb();
    events = new LycheeEventStore(db as any);
    outbox = new LycheePromptStore(db as any);
    let count = 0;
    transport = {
      available: true,
      send: jest.fn(async () => 'test-only-question-' + ++count),
    };
    users = {
      findOne: jest
        .fn()
        .mockResolvedValue({ firebaseId: 'owner', phone: '0501234567' }),
    };
    businesses = {
      find: jest
        .fn()
        .mockResolvedValue([
          { businessNumber: '123' },
          { businessNumber: '456' },
        ]),
    };
  });

  it('commits document bytes and one stable draft atomically; rolls back insert failure', async () => {
    db.failInsert = true;
    await expect(stage()).rejects.toThrow();
    expect(db.rows.get('doc').status).toBe('PROCESSING');
    expect(journal()).toBeUndefined();
    db.failInsert = false;
    const job = await stage();
    expect(journal().status).toBe('PROMPT_PENDING');
    expect(db.rows.get('doc').content).toEqual(Buffer.from('%PDF-test'));
    await expect(
      events.waitForBusiness(job, 'owner', journal().payload.choices, {
        content: Buffer.from('x'),
        filename: 'x.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow();
    expect(
      [...db.rows.values()].filter(
        (r) => r.payload.kind === 'BUSINESS_QUESTION',
      ),
    ).toHaveLength(1);
  });

  it('sends one simulated question and persists its ID only on the parent ownership column', async () => {
    await stage();
    await makeService().tick();
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(db.rows.get('doc').prompt_whatsapp_message_id).toBe(
      'test-only-question-1',
    );
    expect(journal().payload.providerMessageId).toBe('test-only-question-1');
    expect(journal().prompt_whatsapp_message_id).toBeUndefined();
    expect(journal().status).toBe('PROMPT_SENT');
    await makeService().tick();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('rolls back a conflicting draft without overwriting an existing question', async () => {
    const job = await stage();
    const original = journal().payload_hash;
    Object.assign(db.rows.get('doc'), {
      status: 'PROCESSING',
      lease_token: job.lease_token,
    });
    const changed = journal().payload.choices.map((c, i) => ({
      ...c,
      label: i === 0 ? 'changed label' : c.label,
    }));
    await expect(
      events.waitForBusiness(job, 'owner', changed, {
        content: Buffer.from('x'),
        filename: 'x.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow();
    expect(journal().payload_hash).toBe(original);
    expect(db.rows.get('doc').status).toBe('PROCESSING');
  });

  it('concurrent workers claim only one question', async () => {
    await stage();
    await Promise.all([makeService().tick(), makeService().tick()]);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('retries only the known receipt after a database error or lost SQL acknowledgement', async () => {
    for (const failure of ['failReceipt', 'failReceiptAfterCommit']) {
      const id = failure;
      await stage(id);
      (db as any)[failure] = 1;
      await makeService().tick();
      expect(journal(id).status).toBe('PROMPT_SENT');
    }
    expect(transport.send).toHaveBeenCalledTimes(2);
  });

  it('resumes linking after restart without re-sending the question', async () => {
    await stage();
    db.failLink = 1;
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_LINK');
    outbox = new LycheePromptStore(db as any);
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_SENT');
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('a crash after saving the mapping never sends again, even after the document advanced', async () => {
    await stage();
    db.failSent = 1;
    await makeService().tick();
    expect(db.rows.get('doc').prompt_whatsapp_message_id).toBeTruthy();
    db.rows.get('doc').status = 'IMPORTED';
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_SENT');
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('passes the durable question identity rather than a transient lease to delivery', async () => {
    await stage();
    const id = journal().event_id;
    await makeService().tick();
    expect(transport.send).toHaveBeenCalledWith(expect.any(Object), id);
    expect(id).toBe(promptEventId('channel', 'doc'));
  });

  it('uncertain external results are quarantined, never automatically sent twice', async () => {
    await stage();
    transport.send.mockRejectedValue(
      new Error('timeout after provider may have accepted'),
    );
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_UNKNOWN');
    await makeService().tick();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('logs sanitized provider failure metadata without changing the no-resend policy', async () => {
    await stage();
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    try {
      transport.send.mockRejectedValue(
        new PromptDeliveryError({
          httpStatus: 403,
          providerCode: 'MISSING_PERMISSION',
          providerReason: 'Requires conversations:write',
          failureKind: 'http',
        }),
      );
      await makeService().tick();
      expect(journal().status).toBe('PROMPT_UNKNOWN');
      const log = warn.mock.calls
        .map((args) => JSON.parse(args[0] as string))
        .find((line) => line.stage === 'business.prompt.send');
      expect(log).toMatchObject({
        httpStatus: 403,
        providerCode: 'MISSING_PERMISSION',
        providerReason: 'Requires conversations:write',
        failureKind: 'http',
      });
      await makeService().tick();
      expect(transport.send).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('expired send leases quarantine, whereas expired linking leases resume mapping only', async () => {
    await stage('unknown');
    Object.assign(journal('unknown'), {
      status: 'PROMPT_SENDING',
      lease_token: 'old',
      expired: true,
    });
    await makeService().tick();
    expect(journal('unknown').status).toBe('PROMPT_UNKNOWN');
    expect(transport.send).not.toHaveBeenCalled();
    await stage('known');
    Object.assign(journal('known'), {
      status: 'PROMPT_LINKING',
      lease_token: 'old2',
      expired: true,
    });
    journal('known').payload.providerMessageId = 'test-only-known-receipt';
    await makeService().tick();
    expect(journal('known').status).toBe('PROMPT_SENT');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('failed receipt persistence never retries the send', async () => {
    await stage();
    db.failReceipt = 2;
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_UNKNOWN');
    await makeService().tick();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('a durable receipt with two lost acknowledgements is recovered without another send', async () => {
    await stage();
    db.failReceiptAfterCommit = 2;
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_UNKNOWN');
    expect(journal().payload.providerMessageId).toBeTruthy();
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_SENT');
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('preflight DB errors retry safely before any external attempt', async () => {
    await stage();
    users.findOne.mockRejectedValueOnce(new Error('DB unavailable'));
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_PENDING');
    expect(transport.send).not.toHaveBeenCalled();
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_SENT');
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('revoked business ownership cancels a pending question', async () => {
    await stage();
    businesses.find.mockResolvedValue([{ businessNumber: '123' }]);
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_CANCELLED');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('a conflicting parent mapping is preserved and stops further delivery attempts', async () => {
    await stage();
    transport.send.mockImplementation(async () => {
      db.rows.get('doc').prompt_whatsapp_message_id = 'test-only-other-mapping';
      return 'test-only-returned-id';
    });
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_CANCELLED');
    expect(db.rows.get('doc').prompt_whatsapp_message_id).toBe(
      'test-only-other-mapping',
    );
    await makeService().tick();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('revalidates user phone, businesses and snapshot before any send', async () => {
    await stage();
    users.findOne.mockResolvedValue({ phone: '0549999999' });
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_CANCELLED');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('explicit offline transport never claims jobs; app uses only the dev-guarded binding', async () => {
    await stage();
    const queries = db.queries;
    await makeService(new NoSendPromptTransport()).tick();
    expect(db.queries).toBe(queries);
    expect(db.rows.get('doc').prompt_whatsapp_message_id).toBeUndefined();
    expect(journal().status).toBe('PROMPT_PENDING');
    const providers = Reflect.getMetadata('providers', LycheeModule);
    expect(providers).toContainEqual({
      provide: LycheePromptTransport,
      useClass: DevelopmentOnlyPromptTransport,
    });
    expect(providers).not.toContain(LycheeHttpPromptTransport);
  });

  it('two simulated questions answered out of order update only the quoted document', async () => {
    await stage('A');
    await stage('B');
    await makeService().tick();
    await makeService().tick();
    const reply = (id: string, label: string) => ({
      ...doc('reply'),
      has_media: false,
      message_type: 'text',
      text: label,
      reply_to_whatsapp_message_id: db.rows.get(id).prompt_whatsapp_message_id,
    });
    const choices = journal('A').payload.choices;
    expect(
      await events.selectBusiness(reply('B', choices[1].label), 'owner'),
    ).toBe(true);
    expect(db.rows.get('A').status).toBe('WAITING_FOR_BUSINESS');
    expect(
      await events.selectBusiness(reply('A', choices[0].label), 'owner'),
    ).toBe(true);
    expect(db.rows.get('A').business_number).toBe('123');
    expect(db.rows.get('B').business_number).toBe('456');
    expect(transport.send).toHaveBeenCalledTimes(2);
  });

  it('draft hashes survive MySQL JSON key reordering and distinguish changed recipients', async () => {
    await stage();
    const draft = journal().payload;
    const reordered = {
      request: Object.fromEntries(Object.entries(draft.request).reverse()),
      choices: draft.choices.map((c) =>
        Object.fromEntries(Object.entries(c).reverse()),
      ),
      documentEventId: draft.documentEventId,
      kind: draft.kind,
    };
    expect(promptHash(reordered as any)).toBe(journal().payload_hash);
    expect(
      promptHash({ ...draft, request: { ...draft.request, phone: 'other' } }),
    ).not.toBe(journal().payload_hash);
    expect(promptEventId('channel', 'doc')).not.toBe(
      promptEventId('channel', 'other'),
    );
    journal().payload = reordered;
    await makeService().tick();
    expect(journal().status).toBe('PROMPT_SENT');
  });
});
