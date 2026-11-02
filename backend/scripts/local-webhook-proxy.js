'use strict';

// Local development only. No dotenv, credentials, database, cloud proxy or Nest startup.
const http = require('node:http');
const { performance } = require('node:perf_hooks');

function transportHeaders(headers) {
  const excluded = new Set(['connection', 'keep-alive', 'proxy-authenticate',
    'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
  for (const name of String(headers.connection || '').split(',')) excluded.add(name.trim().toLowerCase());
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())));
}

function createLocalWebhookProxy({ lycheePort = 3000, feezbackPort = 3001, timeoutMs = 30000, log = console.info } = {}) {
  for (const port of [lycheePort, feezbackPort]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 3002)
      throw new Error('Expected a local backend port different from proxy port 3002');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('Expected a positive timeout');
  const server = http.createServer((req, res) => {
    const started = performance.now();
    // Match raw path without decoding/rewriting. Preserve the original path and query upstream.
    const pathname = (req.url || '').split('?')[0].replace(/\/$/, '');
    let route = 'unknown', port;
    const sendError = (status, error) => {
      if (res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ error }));
    };
    res.once('finish', () => log(JSON.stringify({ component: 'LocalWebhookProxy', route,
      port, method: req.method, status: res.statusCode, durationMs: Math.round((performance.now() - started) * 100) / 100 })));
    if (pathname === '/_local-webhook-proxy/health' && req.method === 'GET') {
      route = 'health';
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, lycheePort, feezbackPort })); return;
    }
    if (['/webhooks/lychee', '/webhooks/lychee/reply-owner'].includes(pathname) && req.method === 'POST') {
      route = 'lychee'; port = lycheePort;
    } else if (pathname === '/feezback/webhook' && ['GET', 'POST'].includes(req.method)) {
      route = 'feezback'; port = feezbackPort;
    } else { req.resume(); sendError(404, 'Unknown local webhook route'); return; }

    const headers = transportHeaders(req.headers);
    headers.host = `127.0.0.1:${port}`;
    const upstream = http.request({ hostname: '127.0.0.1', port, path: req.url,
      method: req.method, headers, agent: false }, incoming => {
      incoming.on('error', () => sendError(502, 'Local backend response interrupted'));
      res.writeHead(incoming.statusCode, transportHeaders(incoming.headers));
      incoming.pipe(res);
    });
    upstream.setTimeout(timeoutMs, () => {
      const error = new Error('Local backend timeout'); error.code = 'LOCAL_UPSTREAM_TIMEOUT';
      upstream.destroy(error);
    });
    upstream.on('error', error => sendError(error.code === 'LOCAL_UPSTREAM_TIMEOUT' ? 504 : 502,
      error.code === 'LOCAL_UPSTREAM_TIMEOUT' ? 'Local backend timed out' : 'Local backend unavailable'));
    req.once('aborted', () => upstream.destroy());
    req.once('error', () => upstream.destroy());
    res.once('close', () => { if (!res.writableFinished) upstream.destroy(); });
    // Stream untouched bytes, including compressed/binary payloads and signature headers.
    // Never parse JSON, follow redirects, retry, fail over or replay webhooks.
    req.pipe(upstream);
  });
  server.requestTimeout = timeoutMs;
  server.headersTimeout = Math.min(timeoutMs, 15000);
  return server;
}

if (require.main === module) {
  const server = createLocalWebhookProxy();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? 'Local webhook proxy could not start: port 3002 is already in use.'
      : 'Local webhook proxy could not start.');
    process.exitCode = 1;
  });
  server.listen(3002, '127.0.0.1', () => {
    console.info('Local webhook proxy: 127.0.0.1:3002 | Lychee -> 3000 | Feezback -> 3001');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close();
    server.closeAllConnections();
  });
}

module.exports = { createLocalWebhookProxy };
