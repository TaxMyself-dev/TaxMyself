'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createHmac } = require('node:crypto');
const { createLocalWebhookProxy } = require('./local-webhook-proxy');

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
async function close(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
async function harness(t, options = {}) {
  const seen = { lychee: [], feezback: [] }, logs = [];
  const backend = name => http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    seen[name].push({ method: req.method, path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
    if (req.url.includes('timeout-test')) return;
    if (req.url.includes('redirect-test')) { res.writeHead(307, { location: 'https://not-contacted.invalid/' }); res.end(); return; }
    res.writeHead(name === 'lychee' ? 202 : 201, { 'content-type': 'application/octet-stream', 'x-mock-backend': name });
    res.end(Buffer.from([0, 255, 1, 2]));
  });
  const lychee = backend('lychee'), feezback = backend('feezback');
  const lycheePort = await listen(lychee), feezbackPort = await listen(feezback);
  const proxy = createLocalWebhookProxy({ lycheePort, feezbackPort, log: line => logs.push(line), ...options });
  const port = await listen(proxy);
  t.after(async () => { await close(proxy); await close(lychee); await close(feezback); });
  return { seen, logs, lychee, feezback, port };
}
function request(port, path, { method = 'POST', body = Buffer.from('{}'), headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method,
      headers: { 'content-length': body.length, ...headers } }, async res => {
      try { const chunks = []; for await (const chunk of res) chunks.push(chunk);
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
      } catch (error) { reject(error); }
    });
    req.on('error', reject); req.end(body);
  });
}

test('routes Lychee and Feezback deterministically with exact bytes, signatures, path and query preserved', async t => {
  const h = await harness(t);
  const body = Buffer.from(' {\r\n "test": "שלום", "space":  1\r\n}\r\n');
  const signature = 'sha256=' + createHmac('sha256', 'fake-test-secret').update(body).digest('hex');
  for (let i = 0; i < 6; i++) {
    const result = await request(h.port, '/webhooks/lychee?x=%2F&x=2', { body, headers: { 'x-lychee-signature': signature, 'content-type': 'application/json' } });
    assert.equal(result.status, 202); assert.deepEqual(result.body, Buffer.from([0, 255, 1, 2]));
  }
  await request(h.port, '/webhooks/lychee/reply-owner', { body });
  const fee = await request(h.port, '/feezback/webhook?test=1', { body, headers: { 'x-feezback-secret': 'fake-feezback-secret' } });
  assert.equal(fee.status, 201); assert.equal(fee.headers['x-mock-backend'], 'feezback');
  assert.equal(h.seen.lychee.length, 7); assert.equal(h.seen.feezback.length, 1);
  for (const req of h.seen.lychee.slice(0, 6)) {
    assert.deepEqual(req.body, body); assert.equal(req.path, '/webhooks/lychee?x=%2F&x=2');
    assert.equal(req.headers['x-lychee-signature'], signature);
  }
  assert.equal(h.seen.feezback[0].headers['x-feezback-secret'], 'fake-feezback-secret');
  const logs = h.logs.join('\n');
  for (const secret of ['fake-feezback-secret', signature, 'שלום', '%2F']) assert.ok(!logs.includes(secret));
});

test('supports Feezback GET verification and health without backend probes', async t => {
  const h = await harness(t);
  assert.equal((await request(h.port, '/_local-webhook-proxy/health', { method: 'GET', body: Buffer.alloc(0) })).status, 200);
  assert.equal(h.seen.lychee.length + h.seen.feezback.length, 0);
  assert.equal((await request(h.port, '/feezback/webhook/', { method: 'GET', body: Buffer.alloc(0) })).status, 201);
  assert.equal(h.seen.feezback[0].method, 'GET');
});

test('removes hop-by-hop headers while retaining content metadata and end-to-end authentication', async t => {
  const h = await harness(t);
  const body = Buffer.from([31, 139, 0, 255, 128]);
  await request(h.port, '/webhooks/lychee', { body, headers: {
    connection: 'keep-alive, x-private-hop', 'x-private-hop': 'not-forwarded',
    'proxy-connection': 'keep-alive', 'content-encoding': 'gzip',
    'content-type': 'application/json', 'x-lychee-signature': 'fake-opaque-signature',
  } });
  const forwarded = h.seen.lychee[0];
  assert.deepEqual(forwarded.body, body);
  assert.equal(forwarded.headers['x-private-hop'], undefined);
  assert.equal(forwarded.headers['proxy-connection'], undefined);
  assert.equal(forwarded.headers['content-encoding'], 'gzip');
  assert.equal(forwarded.headers['content-length'], String(body.length));
  assert.equal(forwarded.headers['x-lychee-signature'], 'fake-opaque-signature');
  assert.ok(forwarded.headers.host.startsWith('127.0.0.1:'));
});

test('rejects unrelated paths, methods, path-prefix tricks and absolute proxy targets', async t => {
  const h = await harness(t);
  for (const path of ['/billing/me', '/lychee/webhook', '/webhooks/lychee/extra', '/feezback/webhook-router', 'http://outside.invalid/webhooks/lychee'])
    assert.equal((await request(h.port, path)).status, 404);
  assert.equal((await request(h.port, '/webhooks/lychee', { method: 'GET' })).status, 404);
  assert.equal(h.seen.lychee.length + h.seen.feezback.length, 0);
});

test('a stopped backend returns 502 without retrying or sending to the other backend', async t => {
  const h = await harness(t); await close(h.lychee);
  assert.equal((await request(h.port, '/webhooks/lychee')).status, 502);
  assert.equal(h.seen.feezback.length, 0);
  assert.equal((await request(h.port, '/feezback/webhook')).status, 201);
});

test('a stalled backend returns 504 once; a redirect is passed through without following it', async t => {
  const h = await harness(t, { timeoutMs: 100 });
  assert.equal((await request(h.port, '/webhooks/lychee?timeout-test')).status, 504);
  const redirect = await request(h.port, '/webhooks/lychee?redirect-test');
  assert.equal(redirect.status, 307); assert.equal(redirect.headers.location, 'https://not-contacted.invalid/');
  assert.equal(h.seen.lychee.length, 2); assert.equal(h.seen.feezback.length, 0);
});
