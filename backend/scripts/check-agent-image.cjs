'use strict';

const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const path = require('node:path');

// Use the compiled loader called by AgentHarnessService.load(), without Nest.
assert.equal(process.env.AGENT_BUNDLE_PATH, undefined, 'Use the default image path');
const root = path.resolve(__dirname, '..');
for (const file of ['dist/main.js', 'dist/annual.params.json', 'dist/cities/cities.json', 'assets']) {
  assert.ok(existsSync(path.join(root, file)), `Missing backend asset: ${file}`);
}
const { loadAgentBundle } = require('../dist/agent-harness/agent-bundle-loader.js');
const timeout = setTimeout(() => {
  console.error('Agent image load timed out');
  process.exit(1);
}, 30000);
(async () => {
  try {
    const bundle = await loadAgentBundle();
    for (const name of ['handleAgentHttpRequest', 'disposeAppRuntime']) {
      assert.equal(typeof bundle[name], 'function', `Missing agent export: ${name}`);
    }
    await bundle.disposeAppRuntime();
    console.log('AGENT_IMAGE_LOAD_OK: AgentHarnessService shared loader; handleAgentHttpRequest, disposeAppRuntime');
  } finally {
    clearTimeout(timeout);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
