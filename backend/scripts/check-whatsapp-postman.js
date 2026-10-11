'use strict';

// Execute only the local sandbox folders and their supplied Postman assertions.
// This checks the collection over HTTP without installing a second test runner.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

async function main() {
  if (!process.env.WHATSAPP_DEV_TOKEN)
    throw new Error('Set WHATSAPP_DEV_TOKEN first');
  const collection = JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        '../../docs/features/whatsapp/development.postman_collection.json',
      ),
      'utf8',
    ),
  );
  const values = new Map(collection.variable.map((v) => [v.key, v.value]));
  values.set('devToken', process.env.WHATSAPP_DEV_TOKEN);
  values.set(
    'baseUrl',
    'http://127.0.0.1:' + (process.env.WHATSAPP_SANDBOX_PORT || '8091'),
  );
  const replace = (text) =>
    text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      if (key === '$guid') return randomUUID();
      if (!values.has(key))
        throw new Error('Missing collection variable: ' + key);
      return values.get(key);
    });
  let requests = 0,
    assertions = 0;
  for (const folder of collection.item.slice(0, 2)) {
    for (const item of folder.item) {
      const pm = {
        collectionVariables: {
          get: (key) => values.get(key),
          set: (key, value) => values.set(key, value),
        },
        variables: { replaceIn: replace },
        test: (_name, fn) => {
          fn();
          assertions++;
        },
        expect: (actual) => ({
          to: { eql: (expected) => assert.deepEqual(actual, expected) },
        }),
      };
      for (const event of item.event || []) {
        if (event.listen === 'prerequest')
          vm.runInNewContext(event.script.exec.join('\n'), { pm });
      }
      const result = await fetch(replace(item.request.url), {
        method: item.request.method,
        headers: Object.fromEntries(
          item.request.header.map((h) => [h.key, replace(h.value)]),
        ),
        ...(item.request.body ? { body: replace(item.request.body.raw) } : {}),
        signal: AbortSignal.timeout(10000),
      });
      const body = await result.json();
      pm.response = {
        json: () => body,
        to: { have: { status: (code) => assert.equal(result.status, code) } },
      };
      for (const event of item.event || []) {
        if (event.listen === 'test')
          vm.runInNewContext(event.script.exec.join('\n'), { pm });
      }
      requests++;
      console.log('PASS ' + folder.name + ' / ' + item.name);
    }
  }
  console.log(
    JSON.stringify({ requests, assertions, realDriveRequestsExecuted: 0 }),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
