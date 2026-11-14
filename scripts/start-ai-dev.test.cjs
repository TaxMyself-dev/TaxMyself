const { test } = require('node:test');
const assert = require('node:assert/strict');
const { optionsOf, localDockerHost, developmentEnv, responds, frontendResponds } = require('./start-ai-dev.cjs');
const { createServer } = require('node:http');

test('rejects remote Docker engines, permits local Windows and Linux engines', () => {
  assert.equal(localDockerHost('npipe:////./pipe/dockerDesktopLinuxEngine'), true);
  assert.equal(localDockerHost('unix:///var/run/docker.sock'), true);
  assert.equal(localDockerHost('tcp://127.0.0.1:2375'), true);
  assert.equal(localDockerHost('ssh://production'), false);
  assert.equal(localDockerHost('tcp://remote.example:2375'), false);
});
test('never boots a production database and forces safe development flags without editing input', () => {
  const options = optionsOf([]);
  assert.throws(() => developmentEnv({ DB_DATABASE: 'keepintax' }, options), /Refusing/);
  const original = { DB_DATABASE: 'keepintax-dev', LANGFUSE_PUBLIC_KEY: 'test', LANGFUSE_SECRET_KEY: 'test', DISABLE_SYNCHRONIZE: 'false', SKIP_BOOT_SEED: 'false' };
  const env = developmentEnv(original, options);
  assert.equal(env.DISABLE_SYNCHRONIZE, 'true');
  assert.equal(env.SKIP_BOOT_SEED, 'true');
  assert.equal(env.LANGFUSE_BASE_URL, 'http://localhost:3100');
  assert.equal(original.SKIP_BOOT_SEED, 'false');
});
test('rejects conflicting or malformed ports and unknown flags', () => {
  assert.throws(() => optionsOf(['--backend-port', '3100']), /differ/);
  assert.throws(() => optionsOf(['--frontend-port', 'abc']), /Invalid/);
  assert.throws(() => optionsOf(['--deploy']), /Unknown/);
});
test('frontend readiness requests HTML so the Angular SPA route is not mistaken for a missing server', async () => {
  const server = createServer((req, res) => {
    res.statusCode = req.url === '/dev/agent' && req.headers.accept === 'text/html' ? 200 : 404;
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port;
    assert.equal(await responds(url + '/dev/agent'), false);
    assert.equal(await frontendResponds(url), true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
