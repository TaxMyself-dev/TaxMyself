const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { configuration, createHandler, registerLycheeWebhook } = require('./lychee-webhook');

const env = { LYCHEE_WEBHOOK_ENABLED: 'true', LYCHEE_WEBHOOK_SECRET: 'test-secret',
  LYCHEE_CHANNEL_ID: 'test-channel', LYCHEE_TEST_MODE: 'true',
  LYCHEE_TEST_PHONES: '050-123-4567',
  LYCHEE_DEV_WEBHOOK_URL: 'https://example.ngrok.app/webhooks/lychee',
  LYCHEE_PROD_WEBHOOK_URL: 'https://production.example.com/webhooks/lychee' };

async function invoke({ overrides = {}, eventOverrides = {}, failure = false, status = 200,
  signature, raw, ownership = {}, lookupFailure, routeEnvironment = 'dev', routeFailure = false, routeResponse } = {}) {
  const config = configuration({ ...env, ...overrides });
  const bytes = raw || Buffer.from(JSON.stringify({ event: 'message.received', event_id: 'evt-1',
    channel_id: 'test-channel', sender_phone: '972501234567', contact_phone: '972501234567', text: '[מסמך]',
    has_media: true, message_type: 'document', occurred_at: '2026-11-01T10:00:00.000Z',
    message_id: 'msg-1', whatsapp_message_id: 'wamid.1', reply_to_whatsapp_message_id: null,
    ...eventOverrides }, null, 2));
  const signed = signature ?? ('sha256=' + createHmac('sha256', config.secret).update(bytes).digest('hex'));
  const calls = [];
  const routeCalls = [];
  const handler = createHandler(config, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/reply-owner')) {
      if (url === lookupFailure) throw new Error('lookup offline');
      return new Response(JSON.stringify({ ownsReply: ownership[url] ?? false }), { status: 200 });
    }
    if (failure) throw new Error('offline');
    return { ok: status >= 200 && status < 300 };
  }, { async resolve(event, sender) {
    routeCalls.push({ event, sender });
    if (routeFailure) throw new Error('routing unavailable');
    const text = event.text.trim().replace(/\s+/g, ' ');
    const command = !event.has_media && event.message_type === 'text' && ['בדיקות', 'סיום בדיקות'].includes(text);
    return routeResponse || { environment: command ? text === 'בדיקות' ? 'dev' : 'prod' : routeEnvironment, command };
  } });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ body: bytes, headers: { 'x-lychee-signature': signed } }, res);
  return { res, calls, routeCalls, bytes, signed };
}

test('test sender goes only to ngrok with exact signed bytes', async () => {
  const { res, calls, bytes, signed } = await invoke();
  assert.equal(res.code, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, env.LYCHEE_DEV_WEBHOOK_URL);
  assert.strictEqual(calls[0].options.body, bytes);
  assert.equal(calls[0].options.headers['x-lychee-signature'], signed);
  assert.equal(calls[0].options.redirect, 'error');
});

test('quoted dev question routes reply to dev without marker, preserving signed bytes', async () => {
  const { res, calls, bytes, signed } = await invoke({ eventOverrides: {
    text: 'business A', reply_to_whatsapp_message_id: 'wamid.dev-question' },
    ownership: { [env.LYCHEE_DEV_WEBHOOK_URL + '/reply-owner']: true } });
  assert.equal(res.code, 200);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url, env.LYCHEE_DEV_WEBHOOK_URL);
  for (const call of calls) {
    assert.strictEqual(call.options.body, bytes);
    assert.equal(call.options.headers['x-lychee-signature'], signed);
  }
});
test('question owner takes precedence over the sender test mode', async () => {
  const { res, calls, routeCalls } = await invoke({ eventOverrides: { reply_to_whatsapp_message_id: 'wamid.prod-question' },
    ownership: { [env.LYCHEE_PROD_WEBHOOK_URL + '/reply-owner']: true } });
  assert.equal(res.code, 200);
  assert.equal(calls[2].url, env.LYCHEE_PROD_WEBHOOK_URL);
  assert.equal(routeCalls.length, 0);
});
test('unknown or conflicting reply ownership forwards to neither environment', async () => {
  for (const ownership of [{}, { [env.LYCHEE_DEV_WEBHOOK_URL + '/reply-owner']: true,
    [env.LYCHEE_PROD_WEBHOOK_URL + '/reply-owner']: true }]) {
    const { res, calls } = await invoke({ eventOverrides: { reply_to_whatsapp_message_id: 'wamid.unknown' }, ownership });
    assert.equal(res.code, 409);
    assert.ok(calls.every(x => x.url.endsWith('/reply-owner')));
  }
});
test('unavailable dev ownership lookup never falls back to production', async () => {
  const { res, calls } = await invoke({ eventOverrides: { reply_to_whatsapp_message_id: 'wamid.question' },
    lookupFailure: env.LYCHEE_DEV_WEBHOOK_URL + '/reply-owner',
    ownership: { [env.LYCHEE_PROD_WEBHOOK_URL + '/reply-owner']: true } });
  assert.equal(res.code, 502);
  assert.ok(calls.every(x => x.url.endsWith('/reply-owner')));
});
test('unlisted sender can only resolve production ownership', async () => {
  const { res, calls } = await invoke({ eventOverrides: { sender_phone: '0541234567', contact_phone: '0541234567',
    reply_to_whatsapp_message_id: 'wamid.prod' },
    ownership: { [env.LYCHEE_PROD_WEBHOOK_URL + '/reply-owner']: true } });
  assert.equal(res.code, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, env.LYCHEE_PROD_WEBHOOK_URL);
});
test('other senders go only to production', async () => {
  const { calls } = await invoke({ eventOverrides: { sender_phone: '972509999999', contact_phone: '972509999999' } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, env.LYCHEE_PROD_WEBHOOK_URL);
});
test('legacy test mode flag does not override persisted routing', async () => {
  const { calls } = await invoke({ overrides: { LYCHEE_TEST_MODE: 'false' } });
  assert.equal(calls[0].url, env.LYCHEE_DEV_WEBHOOK_URL);
});
test('ngrok failure never falls back to production', async () => {
  const { res, calls } = await invoke({ failure: true });
  assert.equal(res.code, 502);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, env.LYCHEE_DEV_WEBHOOK_URL);
});
test('downstream rejection is not acknowledged', async () => {
  assert.equal((await invoke({ status: 503 })).res.code, 502);
});
test('bad signatures including non ASCII never forward', async () => {
  for (const signature of ['sha256=' + '0'.repeat(64), 'א'.repeat(71), '']) {
    const { res, calls, routeCalls } = await invoke({ signature });
    assert.equal(res.code, 401); assert.equal(calls.length, 0); assert.equal(routeCalls.length, 0);
  }
});
test('invalid signed payload or channel never forwards', async () => {
  for (const options of [{ raw: Buffer.from('{') }, { eventOverrides: { channel_id: 'other' } },
    { eventOverrides: { sender_phone: 'bad' } }, { eventOverrides: { contact_phone: '972509999999' } }]) {
    const { res, calls } = await invoke(options);
    assert.equal(res.code, 400); assert.equal(calls.length, 0);
  }
});
test('configuration fails closed', () => {
  for (const overrides of [{ LYCHEE_WEBHOOK_SECRET: '' }, { LYCHEE_TEST_PHONES: 'invalid' },
    { LYCHEE_DEV_WEBHOOK_URL: 'http://localhost:3000' },
    { LYCHEE_PROD_WEBHOOK_URL: 'https://127.0.0.1/path' },
    { LYCHEE_DEV_WEBHOOK_URL: env.LYCHEE_PROD_WEBHOOK_URL }]) {
    assert.throws(() => configuration({ ...env, ...overrides }));
  }
});

test('inactive authorized sender uses production, including legacy #dev captions', async () => {
  for (const text of ['[מסמך]', 'invoice', '#dev', '#developer', 'x#dev', '#devops']) {
    const { calls } = await invoke({ eventOverrides: { text }, routeEnvironment: 'prod' });
    assert.equal(calls[0].url, env.LYCHEE_PROD_WEBHOOK_URL);
  }
});

test('allowlisted commands use SQL storage without contacting either backend', async () => {
  for (const text of ['בדיקות', 'סיום בדיקות', '  סיום   בדיקות  ']) {
    const { res, calls, routeCalls, bytes } = await invoke({ eventOverrides: { text, has_media: false, message_type: 'text' } });
    assert.equal(res.code, 200);
    assert.equal(calls.length, 0);
    assert.equal(routeCalls.length, 1);
    assert.equal(routeCalls[0].sender, '972501234567');
    assert.deepEqual(routeCalls[0].event, JSON.parse(bytes));
  }
});

test('unlisted sender commands cannot access or change test routing', async () => {
  for (const text of ['בדיקות', 'סיום בדיקות']) {
    const { calls, routeCalls } = await invoke({ eventOverrides: { text, has_media: false, message_type: 'text',
      sender_phone: '0541234567', contact_phone: '0541234567' } });
    assert.equal(routeCalls.length, 0);
    assert.equal(calls[0].url, env.LYCHEE_PROD_WEBHOOK_URL);
  }
});

test('media caption and longer text never act as a command', async () => {
  for (const eventOverrides of [{ text: 'בדיקות' }, { text: 'אני עושה בדיקות', has_media: false, message_type: 'text' }]) {
    const { calls } = await invoke({ eventOverrides, routeEnvironment: 'prod' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, env.LYCHEE_PROD_WEBHOOK_URL);
  }
});

test('unavailable or malformed routing authority never forwards to either environment', async () => {
  for (const options of [{ routeFailure: true }, { routeResponse: { environment: 'unknown', command: false } },
    { routeResponse: { environment: 'dev', command: true } }]) {
    const { res, calls } = await invoke(options);
    assert.equal(res.code, 502);
    assert.equal(calls.length, 0);
  }
});
test('empty sender falls back to local contact phone without changing signed bytes', async () => {
  for (const sender_phone of [null, undefined, '', '  ']) {
    const { res, calls, bytes } = await invoke({ eventOverrides: { sender_phone, contact_phone: '0501234567', text: 'test #DEV file' } });
    assert.equal(res.code, 200);
    assert.equal(calls[0].url, env.LYCHEE_DEV_WEBHOOK_URL);
    assert.strictEqual(calls[0].options.body, bytes);
  }
});
test('disabled feature registers no route', () => {
  registerLycheeWebhook({ post() { assert.fail('unexpected route'); } }, {}, {});
  assert.equal(configuration({}), null);
});

test('missing SQL settings do not prevent proxy route registration and never fall back to prod', async () => {
  let handler;
  registerLycheeWebhook({ post(_path, _parser, callback) { handler = callback; } },
    { raw() { return () => {}; } }, env);
  const raw = Buffer.from(JSON.stringify({ event: 'message.received', event_id: 'command', channel_id: env.LYCHEE_CHANNEL_ID,
    message_id: 'msg', whatsapp_message_id: 'wamid', sender_phone: null, contact_phone: '0501234567',
    has_media: false, message_type: 'text', text: 'בדיקות', occurred_at: '2026-11-01T10:00:00.000Z', reply_to_whatsapp_message_id: null }));
  const signature = 'sha256=' + createHmac('sha256', env.LYCHEE_WEBHOOK_SECRET).update(raw).digest('hex');
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handler({ body: raw, headers: { 'x-lychee-signature': signature } }, res);
  assert.equal(res.code, 502);
});

test('proxy audit identifies route without revealing text, phones, signatures or body', async () => {
  const lines = [];
  const originalLog = console.info;
  console.info = value => lines.push(value);
  try {
    await invoke({ eventOverrides: { text: '#dev PRIVATE_CAPTION', message_id: 'PRIVATE_MESSAGE_ID' } });
    await invoke({ signature: 'PRIVATE_SIGNATURE' });
  } finally { console.info = originalLog; }
  const joined = lines.join('\n');
  for (const secret of ['PRIVATE_CAPTION', 'PRIVATE_MESSAGE_ID', 'PRIVATE_SIGNATURE', '972501234567']) {
    assert.ok(!joined.includes(secret));
  }
  assert.ok(lines.map(x => JSON.parse(x)).some(x => x.event_id === 'evt-1' && x.environment === 'dev'));
});
