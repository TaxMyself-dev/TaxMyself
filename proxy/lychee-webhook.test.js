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
  signature, raw } = {}) {
  const config = configuration({ ...env, ...overrides });
  const bytes = raw || Buffer.from(JSON.stringify({ event: 'message.received', event_id: 'evt-1',
    channel_id: 'test-channel', sender_phone: '972501234567', contact_phone: '972501234567',
    ...eventOverrides }, null, 2));
  const signed = signature ?? ('sha256=' + createHmac('sha256', config.secret).update(bytes).digest('hex'));
  const calls = [];
  const handler = createHandler(config, async (url, options) => {
    calls.push({ url, options });
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
test('other senders go only to production', async () => {
  const { calls } = await invoke({ eventOverrides: { sender_phone: '972509999999', contact_phone: '972509999999' } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, env.LYCHEE_PROD_WEBHOOK_URL);
});
test('test mode off sends test sender to production', async () => {
  const { calls } = await invoke({ overrides: { LYCHEE_TEST_MODE: 'false' } });
  assert.equal(calls[0].url, env.LYCHEE_PROD_WEBHOOK_URL);
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
    { eventOverrides: { sender_phone: '' } }, { eventOverrides: { contact_phone: '972509999999' } }]) {
    const { res, calls } = await invoke(options);
    assert.equal(res.code, 400); assert.equal(calls.length, 0);
  }
});
test('configuration fails closed', () => {
  for (const overrides of [{ LYCHEE_WEBHOOK_SECRET: '' }, { LYCHEE_TEST_PHONES: '' },
    { LYCHEE_TEST_MODE: 'TRUE' }, { LYCHEE_DEV_WEBHOOK_URL: 'http://localhost:3000' },
    { LYCHEE_PROD_WEBHOOK_URL: 'https://127.0.0.1/path' },
    { LYCHEE_DEV_WEBHOOK_URL: env.LYCHEE_PROD_WEBHOOK_URL }]) {
    assert.throws(() => configuration({ ...env, ...overrides }));
  }
});
test('disabled feature registers no route', () => {
  registerLycheeWebhook({ post() { assert.fail('unexpected route'); } }, {}, {});
  assert.equal(configuration({}), null);
});
