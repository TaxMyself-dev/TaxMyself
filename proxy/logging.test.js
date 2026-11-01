const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

for (const endpoint of ['/tpp/v1/users/test/cards', '/token', '/link']) {
  test('redacts credentials without altering forwarding: ' + endpoint, () => {
    const logs = [];
    let options;
    const app = { use() {}, get() {}, post() {}, listen() {} };
    const express = () => app;
    express.json = () => () => {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8'), {
      require(name) {
        if (name === 'express') return express;
        if (name === 'http-proxy-middleware') return { createProxyMiddleware(value) { options = value; } };
        if (name === './lychee-webhook') return { registerLycheeWebhook() {} };
        throw Error('Unexpected dependency: ' + name);
      },
      process: { env: { PROXY_MODE: 'feezback-prod' } }, Buffer,
      console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    });
    const token = 'eyJhbGciOiJSU0EtT0FFUC0yNTYi.encrypted-key.iv.ciphertext.tag';
    const signed = 'private-signed-body-token';
    const headers = { authorization: 'Bearer ' + token, cookie: 'private-cookie', 'x-api-key': 'private-api-key' };
    const written = [];
    const outgoing = {
      getHeaders: () => ({ ...headers }),
      getHeader: name => headers[name.toLowerCase()],
      setHeader: (name, value) => { headers[name.toLowerCase()] = value; },
      removeHeader: name => { delete headers[name.toLowerCase()]; },
      write: body => written.push(body),
    };
    const req = { path: endpoint, url: endpoint, originalUrl: '/proxy/feezback' + endpoint,
      method: endpoint.endsWith('/cards') ? 'GET' : 'POST',
      headers: { authorization: 'Bearer ' + token },
      body: endpoint.endsWith('/cards') ? undefined : { token: signed },
    };
    options.router(req);
    options.on.proxyReq(outgoing, req, {});
    const output = logs.join('\n');
    for (const secret of [token, token.slice(0, 30), signed, 'private-cookie', 'private-api-key']) {
      assert.equal(output.includes(secret), false, 'credential leaked in diagnostics');
    }
    assert.ok(output.includes('[REDACTED]'));
    assert.ok(output.includes('CURL COMMAND'));
    assert.equal(headers.authorization, 'Bearer ' + token);
    if (req.body) assert.equal(written.join(''), JSON.stringify(req.body));
    else assert.equal(written.length, 0);
  });
}
