const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port;
}
function request(origin, method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(origin + url, { method, headers }, res => {
      let text = ''; res.on('data', chunk => text += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.setTimeout(1200, () => req.destroy(new Error('Local proxy stalled')));
    req.on('error', reject); req.end(body);
  });
}

test('proxy body handling through real local HTTP and upstream forwarding', async t => {
  const received = [], logs = [], webhooks = [];
  const upstream = http.createServer((req, res) => {
    let body = ''; req.on('data', chunk => body += chunk);
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, body, authorization: req.headers.authorization });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
    });
  });
  const target = await listen(upstream);
  const app = express(); const facade = () => app; facade.json = express.json;
  app.listen = () => {}; // Never run the production startup/NAT probe.
  const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  vm.runInNewContext(source, {
    require(name) {
      if (name === 'express') return facade;
      if (name === 'http-proxy-middleware') return { createProxyMiddleware(options) {
        const router = options.router;
        return createProxyMiddleware({ ...options, target, router(req) { router(req); return target; } });
      }};
      throw Error('Unapproved dependency: ' + name);
    },
    process: { env: { PROXY_MODE: 'feezback-prod' } }, Buffer, AbortSignal,
    console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    fetch: async (url, options) => { webhooks.push({ url, body: options.body }); return { status: 200 }; },
  });
  const proxy = http.createServer(app); const origin = await listen(proxy);
  t.after(async () => { proxy.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise(r => proxy.close(r)), new Promise(r => upstream.close(r))]); });
  const cases = [
    ['GET accounts without a body', 'GET', '/tpp/v1/users/local/accounts?preventUpdate=true', undefined, undefined],
    ['GET cards without a body', 'GET', '/tpp/v1/users/local/cards', undefined, undefined],
    ['DELETE without framing', 'DELETE', '/tpp/v1/users/local/consents/local', undefined, undefined],
    ['DELETE zero content length', 'DELETE', '/tpp/v1/users/local/consents/local?reason=clientDisconnectedFromDigital', undefined, '0'],
    ['DELETE empty object', 'DELETE', '/tpp/v1/users/local/consents/local', '{}', '2'],
    ['DELETE empty array', 'DELETE', '/tpp/v1/users/local/consents/local', '[]', '2'],
    ['POST empty body', 'POST', '/link', undefined, '0'],
    ['POST empty object', 'POST', '/link', '{}', '2'],
    ['POST empty array', 'POST', '/link', '[]', '2'],
    ['POST token payload', 'POST', '/token', '{"token":"fake-test-token"}', undefined],
    ['POST link payload', 'POST', '/link', '{"token":"fake-link-token"}', undefined],
    ['PUT JSON', 'PUT', '/tpp/v1/local', '{"value":1}', undefined],
    ['PATCH JSON', 'PATCH', '/tpp/v1/local', '{}', '2'],
  ];
  for (const [name, method, suffix, body, length] of cases) await t.test(name, async () => {
    const headers = { 'content-type': 'application/json', authorization: 'Bearer fake-test-auth' };
    if (length !== undefined) headers['content-length'] = length;
    else if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body));
    const count = received.length;
    const result = await request(origin, method, '/proxy/feezback' + suffix, body, headers);
    assert.equal(result.status, 200); assert.equal(received.length, count + 1);
    const actual = received.at(-1);
    assert.equal(actual.method, method); assert.equal(actual.url, suffix);
    assert.equal(actual.body, body ?? ''); assert.equal(actual.authorization, 'Bearer fake-test-auth');
  });
  for (const body of ['', '{}', '[]', '{"token":"fake-chunk-token"}']) await t.test('chunked JSON body: ' + (body || 'zero bytes'), async () => {
    const count = received.length;
    const result = await request(origin, 'DELETE', '/proxy/feezback/tpp/v1/users/local/consents/chunked', body, {
      'content-type': 'application/json', 'transfer-encoding': 'chunked' });
    assert.equal(result.status, 200); assert.equal(received.length, count + 1);
    assert.equal(received.at(-1).body, body);
  });
  await t.test('preserves existing JSON-key repair for link requests', async () => {
    const body = JSON.stringify({[JSON.stringify({event:'LocalTest'})]: ''});
    const result = await request(origin, 'POST', '/proxy/feezback/link', body, {
      'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) });
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(received.at(-1).body), {event:'LocalTest'});
  });
  await t.test('DELETE without a content-type is forwarded once', async () => {
    const count = received.length;
    const result = await request(origin, 'DELETE', '/proxy/feezback/tpp/v1/users/local/consents/no-type', undefined, {'content-length':'0'});
    assert.equal(result.status, 200); assert.equal(received.length, count+1); assert.equal(received.at(-1).body,'');
  });
  await t.test('malformed JSON is rejected before forwarding', async () => {
    const count = received.length;
    const result = await request(origin, 'POST', '/proxy/feezback/link', '{bad', {
      'content-type': 'application/json', 'content-length': '4' });
    assert.equal(result.status, 400); assert.equal(received.length, count);
  });
  await t.test('webhook acknowledgement and payload forwarding remain intact', async () => {
    const body = JSON.stringify({ event: 'LocalTest', payload: { marker: 'test-only' } });
    const result = await request(origin, 'POST', '/feezback/webhook', body, {
      'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) });
    assert.equal(result.status, 200); assert.equal(webhooks.length, 1);
    assert.deepEqual(JSON.parse(webhooks[0].body), JSON.parse(body));
  });
  assert.ok(logs.some(line => line.includes('Incoming: DELETE')));
  for (const secret of ['fake-test-auth', 'fake-test-token', 'fake-link-token'])
    assert.equal(logs.join('\n').includes(secret), false);
});
