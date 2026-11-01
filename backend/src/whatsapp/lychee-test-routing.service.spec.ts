import { LycheeTestRoutingService, lycheeRoutingCommand } from './lychee-test-routing.service';
import type { LycheeEvent } from './lychee-webhook.controller';

describe('Persistent Lychee test routing (offline)', () => {
  const original = { ...process.env };
  let journal: any[];
  let runner: any;
  let db: any;
  let service: LycheeTestRoutingService;
  const event = (id: string, second: number, overrides: Partial<LycheeEvent> = {}): LycheeEvent => ({
    event: 'message.received', event_id: id, channel_id: 'channel', message_id: 'msg-' + id,
    whatsapp_message_id: 'wamid.' + id, contact_phone: '0501234567', sender_phone: null,
    occurred_at: new Date(Date.UTC(2026, 10, 1, 10, 0, second)).toISOString(),
    text: '[מסמך]', message_type: 'document', has_media: true, reply_to_whatsapp_message_id: null,
    ...overrides,
  });
  const command = (id: string, second: number, text = 'בדיקות', contact_phone = '0501234567') =>
    event(id, second, { text, contact_phone, message_type: 'text', has_media: false });

  beforeEach(() => {
    process.env.LYCHEE_TEST_PHONES = '0501234567,0541234567';
    journal = [];
    runner = { connect: jest.fn(), release: jest.fn(), query: jest.fn(async (sql: string, args: any[]) => {
      if (sql.includes('GET_LOCK')) return [{ acquired: 1 }];
      if (sql.includes('RELEASE_LOCK')) return [{ released: 1 }];
      if (sql.startsWith('SELECT payload_hash')) return journal.filter(r => r.event_id === args[0]);
      if (sql.startsWith('SELECT DISTINCT status,')) {
        const distinct = new Map<string, { status: string; occurred_at: string }>();
        for (const row of journal.filter(r => r.channel_id === args[0] && r.sender_phone === args[1] &&
          r.status.startsWith('ROUTE_COMMAND_') && r.payload.occurred_at <= args[2])) {
          distinct.set(row.status + row.payload.occurred_at, { status: row.status, occurred_at: row.payload.occurred_at });
        }
        return [...distinct.values()].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 2);
      }
      if (sql.startsWith('INSERT')) {
        const [event_id, channel_id, message_id, sender_phone, payload, payload_hash, status] = args;
        journal.push({ event_id, channel_id, message_id, sender_phone, payload: JSON.parse(payload), payload_hash, status });
        return { affectedRows: 1 };
      }
      throw new Error('Unexpected SQL');
    }) };
    db = { options: { database: 'test-only' }, createQueryRunner: jest.fn(() => runner) };
    service = new LycheeTestRoutingService(db);
  });
  afterAll(() => { process.env = original; });

  it('defaults to production, starts tests, routes captionless files, and stops tests', async () => {
    expect(await service.resolve(event('before', 0))).toEqual({ environment: 'prod', command: false });
    expect(await service.resolve(command('start', 1))).toEqual({ environment: 'dev', command: true });
    expect(await service.resolve(event('during', 2))).toEqual({ environment: 'dev', command: false });
    expect(await service.resolve(command('stop', 3, 'סיום בדיקות'))).toEqual({ environment: 'prod', command: true });
    expect(await service.resolve(event('after', 4))).toEqual({ environment: 'prod', command: false });
    expect(journal.every(row => !['PENDING', 'RETRY'].includes(row.status))).toBe(true);
  });

  it('survives service recreation and isolates test senders', async () => {
    await service.resolve(command('start-A', 1));
    const restarted = new LycheeTestRoutingService(db);
    expect(await restarted.resolve(event('A', 2))).toEqual({ environment: 'dev', command: false });
    expect(await restarted.resolve(event('B', 2, { contact_phone: '0541234567' }))).toEqual({ environment: 'prod', command: false });
    await restarted.resolve(command('start-B', 3, 'בדיקות', '0541234567'));
    await restarted.resolve(command('stop-A', 4, 'סיום בדיקות'));
    expect((await restarted.resolve(event('B-still-dev', 5, { contact_phone: '0541234567' }))).environment).toBe('dev');
  });

  it('retains an event decision on retries after ending tests and deduplicates commands', async () => {
    const start = command('start', 1);
    const file = event('file', 2);
    await service.resolve(start);
    await service.resolve(file);
    await service.resolve(command('stop', 3, 'סיום בדיקות'));
    await service.resolve(start);
    expect(journal.length).toBe(3);
    expect((await service.resolve(file)).environment).toBe('dev');
    expect((await service.resolve(event('new-file', 4))).environment).toBe('prod');
  });

  it('a delayed older start does not undo a later stop; old documents use their event time', async () => {
    await service.resolve(command('stop', 4, 'סיום בדיקות'));
    await service.resolve(command('delayed-start', 1));
    expect((await service.resolve(event('new-file', 5))).environment).toBe('prod');
    expect((await service.resolve(event('delayed-file', 2))).environment).toBe('dev');
  });

  it('rejects unlisted senders and missing/invalid configuration before accessing the DB', async () => {
    await expect(service.resolve(command('unlisted', 1, 'בדיקות', '0529999999'))).rejects.toMatchObject({ status: 403 });
    for (const configured of ['', 'bad-number']) {
      process.env.LYCHEE_TEST_PHONES = configured;
      await expect(service.resolve(command('start', 1))).rejects.toMatchObject({ status: 503 });
    }
    expect(db.createQueryRunner).not.toHaveBeenCalled();
  });

  it('rejects an altered duplicate event and releases the lock', async () => {
    await service.resolve(command('start', 1));
    await expect(service.resolve(command('start', 1, 'סיום בדיקות'))).rejects.toMatchObject({ status: 409 });
    expect(runner.query).toHaveBeenLastCalledWith('SELECT RELEASE_LOCK(?)', [expect.any(String)]);
    expect(runner.release).toHaveBeenCalledTimes(2);
  });

  it('fails closed on lock contention and database failure', async () => {
    runner.query.mockResolvedValueOnce([{ acquired: 0 }]);
    await expect(service.resolve(event('file', 1))).rejects.toMatchObject({ status: 503 });
    expect(journal).toEqual([]);
    runner.query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.resolve(event('file', 1))).rejects.toThrow('database unavailable');
    expect(runner.release).toHaveBeenCalledTimes(2);
  });

  it('requires a valid event timestamp', async () => {
    for (const occurred_at of [undefined, '', 'invalid']) {
      await expect(service.resolve(event('file', 1, { occurred_at }))).rejects.toMatchObject({ status: 400 });
    }
    expect(db.createQueryRunner).not.toHaveBeenCalled();
  });

  it('refuses to guess between opposite commands at the same timestamp', async () => {
    await service.resolve(command('start', 1));
    await service.resolve(command('stop', 1, 'סיום בדיקות'));
    await service.resolve(command('stop-duplicate-time', 1, 'סיום בדיקות'));
    await expect(service.resolve(event('file', 2))).rejects.toMatchObject({ status: 409 });
    expect(journal.length).toBe(3);
  });

  it('only exact standalone text commands change the mode', () => {
    expect(lycheeRoutingCommand(command('start', 1, ' בדיקות '))).toBe('dev');
    expect(lycheeRoutingCommand(command('end', 2, 'סיום   בדיקות'))).toBe('prod');
    for (const e of [event('caption', 1, { text: 'בדיקות' }), command('long-text', 1, 'אני עושה בדיקות'),
      command('legacy', 1, '#dev'), event('quoted', 1, { text: 'בדיקות', has_media: false, message_type: 'text', reply_to_whatsapp_message_id: 'wamid' })]) {
      expect(lycheeRoutingCommand(e)).toBeNull();
    }
  });
});
