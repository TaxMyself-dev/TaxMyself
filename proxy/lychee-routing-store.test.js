const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { createRoutingStore, databaseOptions } = require('./lychee-routing-store');
const { configuration, createHandler } = require('./lychee-webhook');

const env = { LYCHEE_DB_NAME: 'keepintax-dev', LYCHEE_DB_HOST: 'test-db.invalid',
  LYCHEE_DB_USER: 'test', LYCHEE_DB_PASSWORD: 'fake-password', LYCHEE_CHANNEL_ID: 'channel',
  LYCHEE_TEST_PHONES: '0501234567,0541234567', LYCHEE_WEBHOOK_ENABLED: 'true', LYCHEE_WEBHOOK_SECRET: 'fake-secret',
  LYCHEE_DEV_WEBHOOK_URL: 'https://example.ngrok.app/webhooks/lychee', LYCHEE_PROD_WEBHOOK_URL: 'https://prod.example/webhooks/lychee' };
const allowed = new Set(['972501234567', '972541234567']);
const sender = '972501234567';
const event = (id, second, overrides = {}) => ({ event: 'message.received', event_id: id, channel_id: 'channel',
  message_id: 'msg-' + id, whatsapp_message_id: 'wamid.' + id, sender_phone: null, contact_phone: '0501234567',
  occurred_at: new Date(Date.UTC(2026, 10, 1, 10, 0, second)).toISOString(),
  text: '[מסמך]', has_media: true, message_type: 'document', reply_to_whatsapp_message_id: null, ...overrides });
const command = (id, second, text = 'בדיקות') => event(id, second, { text, has_media: false, message_type: 'text' });

function fixture() {
  const state = { journal: [], prompts: [], acquired: 1, released: 0, destroyed: 0, connections: 0, options: null, failRelease: false, failInsert: false };
  const factory = options => {
    state.options = options;
    return { async end() {}, async query(options, args) {
      const connection = await this.getConnection();
      try { return await connection.query(options, args); } finally { connection.release(); }
    }, async getConnection() {
      state.connections++;
      return { release() { state.released++; }, destroy() { state.destroyed++; }, async query({ sql, timeout }, args) {
        assert.equal(timeout, 5000);
        if (sql.includes('GET_LOCK')) return [[{ acquired: state.acquired }]];
        if (sql.includes('RELEASE_LOCK')) {
          if (state.failRelease) throw new Error('release failed');
          return [[{ released: 1 }]];
        }
        if (sql.startsWith('SELECT payload_hash')) return [state.journal.filter(r => r.event_id === args[0])];
        if (sql.startsWith('SELECT event_id')) return [state.prompts.filter(r =>
          r.channel_id === args[0] && r.sender_phone === args[1] && r.prompt_whatsapp_message_id === args[2]).slice(0, 2)];
        if (sql.startsWith('SELECT DISTINCT status,')) {
          const distinct = new Map();
          for (const row of state.journal.filter(r => r.channel_id === args[0] && r.sender_phone === args[1] &&
            r.status.startsWith('ROUTE_COMMAND_') && r.payload.occurred_at <= args[2])) {
            distinct.set(row.status + row.payload.occurred_at, { status: row.status, occurred_at: row.payload.occurred_at });
          }
          return [[...distinct.values()].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 2)];
        }
        if (sql.startsWith('INSERT')) {
          if (state.failInsert) throw new Error('insert failed');
          const [event_id, channel_id, message_id, sender_phone, payload, payload_hash, status] = args;
          state.journal.push({ event_id, channel_id, message_id, sender_phone, payload: JSON.parse(payload), payload_hash, status });
          return [{ affectedRows: 1 }];
        }
        throw new Error('Unexpected SQL');
      } };
    } };
  };
  return { state, factory, store: createRoutingStore(env, allowed, factory) };
}

test('defaults to prod, starts dev, accepts captionless files and stops tests', async () => {
  const { store, state } = fixture();
  assert.deepEqual(await store.resolve(event('before', 0), sender), { environment: 'prod', command: false });
  assert.deepEqual(await store.resolve(command('start', 1), sender), { environment: 'dev', command: true });
  assert.equal((await store.resolve(event('during', 2), sender)).environment, 'dev');
  await store.resolve(command('stop', 3, 'סיום בדיקות'), sender);
  assert.equal((await store.resolve(event('after', 4), sender)).environment, 'prod');
  assert.ok(state.journal.every(r => r.status.startsWith('ROUTE_') && r.event_id.startsWith('route:')));
  assert.equal(state.connections, state.released);
});

test('dev prompt ownership survives ending tests without querying a production receiver', async () => {
  const { store, state } = fixture();
  state.prompts.push({ event_id: 'doc', channel_id: 'channel', sender_phone: sender, prompt_whatsapp_message_id: 'wamid.question' });
  await store.resolve(command('stop', 1, 'סיום בדיקות'), sender);
  assert.equal(await store.replyRoute(event('reply', 2, { reply_to_whatsapp_message_id: 'wamid.question' }), sender), 'dev');
  assert.equal(await store.replyRoute(event('other-reply', 2, { reply_to_whatsapp_message_id: 'unknown' }), sender), 'prod');
});

test('unknown test reply, wrong sender and duplicate dev mappings never guess an owner', async () => {
  const { store, state } = fixture();
  await store.resolve(command('start', 1), sender);
  const reply = event('reply', 2, { reply_to_whatsapp_message_id: 'wamid.question' });
  assert.equal(await store.replyRoute(reply, sender), 'unknown');
  state.prompts.push({ event_id: 'other-owner', channel_id: 'channel', sender_phone: '972541234567', prompt_whatsapp_message_id: 'wamid.question' });
  assert.equal(await store.replyRoute(reply, sender), 'unknown');
  state.prompts.push(...['doc1', 'doc2'].map(event_id => ({ event_id, channel_id: 'channel', sender_phone: sender, prompt_whatsapp_message_id: 'wamid.question' })));
  await assert.rejects(store.replyRoute(reply, sender), /Ambiguous/);
});

test('recreated proxy stores see the same mode, isolated per sender', async () => {
  const { store, factory } = fixture();
  await store.resolve(command('start', 1), sender);
  const restarted = createRoutingStore(env, allowed, factory);
  assert.equal((await restarted.resolve(event('during', 2), sender)).environment, 'dev');
  assert.equal((await restarted.resolve(event('other', 2, { contact_phone: '0541234567' }), '972541234567')).environment, 'prod');
});

test('duplicate start never undoes stop and document retries retain original destination', async () => {
  const { store, state } = fixture();
  const start = command('start', 1), file = event('file', 2);
  await store.resolve(start, sender);
  await store.resolve(file, sender);
  await store.resolve(command('stop', 3, 'סיום בדיקות'), sender);
  await store.resolve(start, sender);
  assert.equal((await store.resolve(file, sender)).environment, 'dev');
  assert.equal(state.journal.length, 3);
  assert.equal((await store.resolve(event('new-file', 4), sender)).environment, 'prod');
  await assert.rejects(store.resolve({ ...start, text: 'סיום בדיקות' }, sender), /Conflicting/);
});

test('delayed commands respect provider time, conflicting timestamps fail closed', async () => {
  const { store } = fixture();
  await store.resolve(command('stop', 4, 'סיום בדיקות'), sender);
  await store.resolve(command('late-start', 1), sender);
  assert.equal((await store.resolve(event('now', 5), sender)).environment, 'prod');
  assert.equal((await store.resolve(event('old-file', 2), sender)).environment, 'dev');
  await store.resolve(command('conflicting-stop', 1, 'סיום בדיקות'), sender);
  await store.resolve(command('same-time-stop', 1, 'סיום בדיקות'), sender);
  await assert.rejects(store.resolve(event('ambiguous-file', 3), sender), /Ambiguous/);
});

test('media captions and quoted or longer text do not toggle mode', async () => {
  const { store } = fixture();
  for (const e of [event('caption', 1, { text: 'בדיקות' }), command('sentence', 2, 'אני עושה בדיקות'), command('legacy', 3, '#dev')]) {
    assert.deepEqual(await store.resolve(e, sender), { environment: 'prod', command: false });
  }
  await assert.rejects(store.resolve(event('quoted', 4, { reply_to_whatsapp_message_id: 'wamid.question' }), sender), /Invalid/);
});

test('unlisted senders, wrong channels and invalid events never open a DB connection', async () => {
  const { store, state } = fixture();
  await assert.rejects(store.resolve(command('bad', 1), '972529999999'), /Unauthorized/);
  await assert.rejects(store.resolve(event('bad', 1, { channel_id: 'other' }), sender), /Unauthorized/);
  for (const overrides of [{ occurred_at: 'invalid' }, { occurred_at: null }, { message_id: '' }, { text: null }]) {
    await assert.rejects(store.resolve(event('bad', 1, overrides), sender));
  }
  assert.equal(state.connections, 0);
});

test('rejects every database except the explicitly configured dev database', async () => {
  for (const name of [undefined, 'keepintax-prod', 'keepintax-dev;DROP TABLE x']) {
    assert.throws(() => databaseOptions({ ...env, LYCHEE_DB_NAME: name }), /keepintax-dev/);
  }
  const { factory, state } = fixture();
  const store = createRoutingStore({ ...env, LYCHEE_DB_NAME: 'keepintax-prod' }, allowed, factory);
  await assert.rejects(store.resolve(command('start', 1), sender), /keepintax-dev/);
  assert.equal(state.connections, 0);
});

test('connection settings require explicit credentials and verify TLS by default', () => {
  const options = databaseOptions(env);
  assert.equal(options.database, 'keepintax-dev');
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.multipleStatements, false);
  assert.equal(databaseOptions({ ...env, LYCHEE_DB_SSL_CA: 'fake-ca' }).ssl.ca, 'fake-ca');
  assert.equal(databaseOptions({ ...env, LYCHEE_DB_SSL: 'false' }).ssl, undefined);
  for (const overrides of [{ LYCHEE_DB_HOST: '' }, { LYCHEE_DB_USER: '' }, { LYCHEE_DB_PASSWORD: '' },
    { LYCHEE_DB_PORT: 'bad' }, { LYCHEE_DB_SSL: 'maybe' }]) assert.throws(() => databaseOptions({ ...env, ...overrides }));
});

test('failed locks and INSERTs release connections and never acknowledge saved state', async () => {
  const { store, state } = fixture();
  state.acquired = 0;
  await assert.rejects(store.resolve(command('start', 1), sender), /busy/);
  state.acquired = 1; state.failInsert = true;
  await assert.rejects(store.resolve(command('start', 1), sender), /insert failed/);
  assert.equal(state.journal.length, 0);
  assert.equal(state.released, 2);
});

test('failed lock release destroys the connection instead of returning a lock to the pool', async () => {
  const { store, state } = fixture();
  state.failRelease = true;
  await assert.rejects(store.resolve(command('start', 1), sender), /release failed/);
  assert.equal(state.destroyed, 1);
  assert.equal(state.released, 0);
});

test('signed proxy flow uses actual store with fake SQL; dev works with production backend offline', async () => {
  const { store, state } = fixture(), forwarded = [];
  const handler = createHandler(configuration(env), async (url, options) => {
    assert.equal(url, env.LYCHEE_DEV_WEBHOOK_URL);
    forwarded.push(options.body);
    return { ok: true };
  }, store);
  for (const e of [command('start', 1), event('file', 2), command('stop', 3, 'סיום בדיקות')]) {
    const raw = Buffer.from(JSON.stringify(e));
    const signature = 'sha256=' + createHmac('sha256', env.LYCHEE_WEBHOOK_SECRET).update(raw).digest('hex');
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ body: raw, headers: { 'x-lychee-signature': signature } }, res);
    assert.equal(res.code, 200);
    if (e.has_media) assert.strictEqual(forwarded[0], raw);
  }
  assert.equal(forwarded.length, 1);
  assert.equal(state.journal.length, 3);
});

test('signed business choice uses direct dev ownership and never calls production or reply-owner HTTP', async () => {
  const { store, state } = fixture();
  state.prompts.push({ event_id: 'doc', channel_id: 'channel', sender_phone: sender, prompt_whatsapp_message_id: 'test-only-question' });
  let forwarded = 0;
  const body = Buffer.from(JSON.stringify(event('choice', 2, { has_media: false, message_type: 'text',
    text: '2. ייעוץ', reply_to_whatsapp_message_id: 'test-only-question' })));
  const handler = createHandler(configuration(env), async (url, options) => {
    assert.equal(url, env.LYCHEE_DEV_WEBHOOK_URL);
    assert.strictEqual(options.body, body);
    forwarded++;
    return { ok: true };
  }, store);
  const signature = 'sha256=' + createHmac('sha256', env.LYCHEE_WEBHOOK_SECRET).update(body).digest('hex');
  const res = { status(code) { this.code = code; return this; }, json() {} };
  await handler({ body, headers: { 'x-lychee-signature': signature } }, res);
  assert.equal(res.code, 200);
  assert.equal(forwarded, 1);
});
