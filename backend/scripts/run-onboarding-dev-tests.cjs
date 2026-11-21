'use strict';
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  existsSync,
} = require('node:fs');
const { developmentOptions } = require('./onboarding-test-target.cjs');
require('dotenv').config({ path: join(__dirname, '../.env'), quiet: true });
const selector = process.argv[3];
if (
  process.argv[2] !== '--database=keepintax-dev' ||
  process.argv.length > 4 ||
  (selector && selector !== '--persistence-only')
)
  throw new Error(
    'Use --database=keepintax-dev with optional --persistence-only',
  );
developmentOptions({
  ...process.env,
  ONBOARDING_APPROVED_DATABASE: 'keepintax-dev',
});
const root = join(__dirname, '../..');
const logs = join(root, '.test-tmp/onboarding-dev');
mkdirSync(logs, { recursive: true });
const files = ['onboarding.mysql'];
let passed = 0;
let failed = 0;
for (const file of files) {
  const stamp = Date.now();
  const log = join(logs, `${file}-${stamp}.log`);
  const report = join(logs, `${file}-${stamp}.json`);
  const fd = openSync(log, 'w');
  let result;
  try {
    result = spawnSync(
      process.execPath,
      [
        join(__dirname, '../node_modules/jest/bin/jest.js'),
        '--runInBand',
        '--runTestsByPath',
        `src/agent-onboarding/${file}.spec.ts`,
        '--json',
        `--outputFile=${report}`,
      ],
      {
        cwd: join(__dirname, '..'),
        stdio: ['ignore', fd, fd],
        shell: false,
        env: { ...process.env, ONBOARDING_APPROVED_DATABASE: 'keepintax-dev' },
      },
    );
  } finally {
    closeSync(fd);
  }
  let summary = existsSync(report)
    ? JSON.parse(readFileSync(report, 'utf8'))
    : null;
  console.log(
    JSON.stringify({
      suite: file,
      status: result.status,
      signal: result.signal,
      errorCode: result.error?.code,
      passed: summary?.numPassedTests,
      failed: summary?.numFailedTests,
      skipped: summary?.numPendingTests,
      report,
      log,
    }),
  );
  if (result.status !== 0 || !summary?.success) {
    console.error(readFileSync(log, 'utf8').slice(-6000));
    process.exitCode = 1;
    break;
  }
  passed += summary.numPassedTests;
  failed += summary.numFailedTests;
}
if (!process.exitCode)
  console.log(
    JSON.stringify({
      database: 'keepintax-dev',
      passed,
      failed,
      cleanup:
        'Each suite verified zero rows remaining for its exact synthetic owners',
    }),
  );
