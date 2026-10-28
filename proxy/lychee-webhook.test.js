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
  signature, raw, ownership = {}, lookupFailure } = {}) {
  const config = configuration({ ...env, ...overrides });
  const bytes = raw || Buffer.from(JSON.stringify({ event: 'message.received', event_id: 'evt-1',
    channel_id: 'test-channel', sender_phone: '972501234567', contact_phone: '972501234567', text: '#dev test',
    ...eventOverrides }, null, 2));
  const signed = signature ?? ('sha256=' + createHmac('sha256', config.secret).update(bytes).digest('hex'));
  const calls = [];
  const handler = createHandler(config, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/reply-owner')) {
      if (url === lookupFailure) throw new Error('lookup offline');
      return new Response(JSON.stringify({ ownsReply: ownership[url] ?? false }), { status: 200 });
    }
    if (failure) throw new Error('offline');
    return { ok: status >= 200 && status < 300 };
  });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ body: bytes, headers: { 'x-lychee-signature': signed } }, res);
  return { res, calls, bytes, signed };
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
test('question owner overrides conflicting dev marker', async () => {
  const { res, calls } = await invoke({ eventOverrides: { reply_to_whatsapp_message_id: 'wamid.prod-question' },
    ownership: { [env.LYCHEE_PROD_WEBHOOK_URL + '/reply-owner']: true } });
  assert.equal(res.code, 200);
  assert.equal(calls[2].url, env.LYCHEE_PROD_WEBHOOK_URL);
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
test('legacy test mode flag does not override per-message marker', async () => {
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
    const { res, calls } = await invoke({ signature });
    assert.equal(res.code, 401); assert.equal(calls.length, 0);
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

test('authorized sender without exact marker uses production', async () => {
  for (const text of ['[מסמך]', 'invoice', '#developer', 'x#dev', '#devops']) {
    const { calls } = await invoke({ eventOverrides: { text } });
    assert.equal(calls[0].url, env.LYCHEE_PROD_WEBHOOK_URL);
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
