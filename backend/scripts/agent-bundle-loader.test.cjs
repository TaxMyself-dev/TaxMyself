'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { registerHooks } = require('node:module');
const { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { fileURLToPath } = require('node:url');
const path = require('node:path');
const os = require('node:os');
// Node 24 strips types; resolve the extensionless local TS import for this
// dependency-free diagnostic. Production still uses Nest's compiled JS.
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('./') && context.parentURL?.endsWith('.ts')) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(candidate)) return next(candidate.href, context);
  }
  return next(specifier, context);
}, load(url, context, next) {
  if (url.endsWith('/agent-bundle-loader.ts')) {
    const source = readFileSync(fileURLToPath(url), 'utf8');
    // Supply the CJS directory global that Nest compilation provides.
    return { format: 'module-typescript', source: `const __dirname = ${JSON.stringify(path.dirname(fileURLToPath(url)))};\n${source}`, shortCircuit: true };
  }
  return next(url, context);
} });
const { loadAgentBundle, agentPackageDir } = require('../src/agent-harness/agent-bundle-loader.ts');
const temporary = mkdtempSync(path.join(os.tmpdir(), 'keepintax-loader-'));
const original = process.env.AGENT_BUNDLE_PATH;
after(() => {
  if (original === undefined) delete process.env.AGENT_BUNDLE_PATH;
  else process.env.AGENT_BUNDLE_PATH = original;
  rmSync(temporary, { recursive: true, force: true });
});
test('default resolves beside backend dist rather than cwd', () => {
  assert.equal(agentPackageDir, path.resolve(__dirname, '../agent'));
});
test('imports ESM at explicit path, preserving package boundary', async () => {
  const fixture = path.join(temporary, 'fixture.mjs');
  writeFileSync(fixture, 'export const handleAgentHttpRequest = () => {}; export const disposeAppRuntime = async () => {};');
  process.env.AGENT_BUNDLE_PATH = fixture;
  const bundle = await loadAgentBundle();
  assert.equal(typeof bundle.handleAgentHttpRequest, 'function');
  assert.equal(typeof bundle.disposeAppRuntime, 'function');
});
test('propagates a missing bundle so the harness can retry', async () => {
  process.env.AGENT_BUNDLE_PATH = path.join(temporary, 'missing.mjs');
  await assert.rejects(loadAgentBundle(), { code: 'ERR_MODULE_NOT_FOUND' });
});
