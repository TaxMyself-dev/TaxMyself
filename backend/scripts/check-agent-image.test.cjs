'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(require.resolve('./check-agent-image.cjs'), 'utf8');

async function check(bundle, env = {}) {
  let result;
  let disposed = false;
  const context = {
    __dirname, console: { log() {}, error() {} },
    process: { env, exitCode: 0 }, setTimeout: () => 1, clearTimeout() {},
    require(name) {
      if (name === 'node:fs') return { existsSync: () => true };
      if (name.includes('agent-bundle-loader')) return {
        loadAgentBundle: async () => {
          result = bundle;
          if (bundle.disposeAppRuntime) bundle = { ...bundle, disposeAppRuntime: async () => { disposed = true; } };
          return bundle;
        },
      };
      return require(name);
    },
  };
  vm.runInNewContext(source, context);
  await new Promise(setImmediate);
  return { code: context.process.exitCode, disposed, result };
}

test('accepts both consumed exports and disposes without a request', async () => {
  const result = await check({ handleAgentHttpRequest() { throw Error('must not handle'); }, disposeAppRuntime() {} });
  assert.equal(result.code, 0);
  assert.equal(result.disposed, true);
});
for (const name of ['handleAgentHttpRequest', 'disposeAppRuntime']) {
  test(`rejects missing ${name}`, async () => {
    const bundle = { handleAgentHttpRequest() {}, disposeAppRuntime() {} };
    delete bundle[name];
    assert.equal((await check(bundle)).code, 1);
  });
}
test('rejects host bundle path override', async () => {
  await assert.rejects(check({}, { AGENT_BUNDLE_PATH: '/host/agent.mjs' }));
});
