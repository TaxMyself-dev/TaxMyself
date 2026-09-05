const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseTimingLine,
  runSupervisedProcess,
  summarizeMeasurements,
  validateProfileEnvironment,
} = require('./profile-startup');

test('profiler refuses missing, non-dev, and production-like targets', () => {
  assert.throws(
    () => validateProfileEnvironment({}),
    /DB_DATABASE is required/,
  );
  assert.throws(
    () => validateProfileEnvironment({ DB_DATABASE: 'other-dev' }),
    /exactly keepintax-dev/,
  );
  assert.throws(
    () => validateProfileEnvironment({ DB_DATABASE: 'keepintax_prodcopy' }),
    /production-like/,
  );
  const environment = validateProfileEnvironment({
    DB_DATABASE: 'keepintax-dev',
    DISABLE_SYNCHRONIZE: 'false',
  });
  assert.equal(environment.DISABLE_SYNCHRONIZE, 'true');
  assert.equal(environment.SKIP_BOOT_SEED, 'false');
  assert.equal(environment.STARTUP_TIMING, 'true');
});

test('timing output parser and summary use stable events', () => {
  assert.deepEqual(
    parseTimingLine(
      '[startup-timing] {"event":"listen.complete","duration_ms":4.25,"elapsed_ms":9}',
    ),
    { event: 'listen.complete', duration_ms: 4.25, elapsed_ms: 9 },
  );
  assert.equal(parseTimingLine('ordinary application log'), null);
  assert.deepEqual(
    summarizeMeasurements([
      [{ event: 'listen.complete', duration_ms: 3 }],
      [{ event: 'listen.complete', duration_ms: 1 }],
      [{ event: 'listen.complete', duration_ms: 2 }],
    ]),
    {
      'listen.complete': { samples: 3, min_ms: 1, median_ms: 2, max_ms: 3 },
    },
  );
});

test('supervisor terminates a child on timeout', async () => {
  let exited = false;
  await assert.rejects(
    runSupervisedProcess({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 100,
      onExit: () => {
        exited = true;
      },
    }),
    /timed out/,
  );
  assert.equal(exited, true);
});
