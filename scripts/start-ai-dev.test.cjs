const { test } = require('node:test');
const assert = require('node:assert/strict');
const { optionsOf, localDockerHost, responds } = require('./start-ai-dev.cjs');
const { createServer } = require('node:http');

test('rejects remote Docker engines, permits local Windows and Linux engines', () => {
  assert.equal(localDockerHost('npipe:////./pipe/dockerDesktopLinuxEngine'), true);
  assert.equal(localDockerHost('unix:///var/run/docker.sock'), true);
  assert.equal(localDockerHost('tcp://127.0.0.1:2375'), true);
  assert.equal(localDockerHost('ssh://production'), false);
  assert.equal(localDockerHost('tcp://remote.example:2375'), false);
});
test('only infrastructure options are accepted; application startup flags are rejected', () => {
  assert.deepEqual(optionsOf([]), { check: false, help: false });
  assert.deepEqual(optionsOf(['--infrastructure-only']), optionsOf([]));
  assert.equal(optionsOf(['--check']).check, true);
  for (const flag of ['--no-build', '--backend-port', '--frontend-port', '--deploy']) {
    assert.throws(() => optionsOf([flag]), /Unknown/);
  }
});
test('Langfuse readiness accepts healthy HTTP and rejects failures', async () => {
  const server = createServer((req, res) => {
    res.statusCode = req.url === '/api/public/health' ? 200 : 503;
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port;
    assert.equal(await responds(url + '/api/public/health'), true);
    assert.equal(await responds(url + '/failure'), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
