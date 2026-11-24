const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SQL,
  validateMetadata,
  assertDevConfig,
  inspect,
} = require('./apply-email-worker-scope-dev.cjs');
const col = {
  DATA_TYPE: 'varchar',
  CHARACTER_MAXIMUM_LENGTH: 16,
  CHARACTER_SET_NAME: 'ascii',
  COLLATION_NAME: 'ascii_bin',
  IS_NULLABLE: 'YES',
  COLUMN_DEFAULT: null,
};
const idx = 'worker_scope,pull_state,next_attempt_at,started_at'
  .split(',')
  .map((COLUMN_NAME) => ({ COLUMN_NAME, NON_UNIQUE: 1, SUB_PART: null }));
test('plans only the additive DDL when absent', () => {
  assert.deepEqual(validateMetadata([], []), [SQL]);
  assert.ok(!/UPDATE |DELETE |DROP |TRUNCATE /i.test(SQL));
});
test('existing exact schema is a no-op', () =>
  assert.deepEqual(validateMetadata([col], idx), []));
test('refuses partial schema or a different index', () => {
  assert.throws(() => validateMetadata([col], []), /index/);
  assert.throws(() => validateMetadata([], idx), /column/);
  assert.throws(() => validateMetadata([col], [...idx].reverse()), /index/);
});
test('refuses incompatible/nullability/default/prefix drift', () => {
  for (const patch of [
    { IS_NULLABLE: 'NO' },
    { COLUMN_DEFAULT: 'test' },
    { COLLATION_NAME: 'ascii_general_ci' },
    { CHARACTER_MAXIMUM_LENGTH: 32 },
  ])
    assert.throws(() => validateMetadata([{ ...col, ...patch }], idx));
  assert.throws(() =>
    validateMetadata(
      [col],
      idx.map((x) => ({ ...x, SUB_PART: 1 })),
    ),
  );
});
test('refuses any non-DEV configuration', () => {
  const cfg = {
    DB_DATABASE: 'keepintax-dev',
    DISABLE_SYNCHRONIZE: 'true',
    COMPOSIO_ENVIRONMENT: 'dev',
  };
  assert.doesNotThrow(() => assertDevConfig(cfg));
  for (const patch of [
    { DB_DATABASE: 'other' },
    { COMPOSIO_ENVIRONMENT: 'prod' },
    { DISABLE_SYNCHRONIZE: 'false' },
  ])
    assert.throws(() => assertDevConfig({ ...cfg, ...patch }));
});
test('runtime DB identity refuses before inspecting or changing tables', async () => {
  let calls = 0;
  await assert.rejects(
    inspect({
      query: async () => {
        calls++;
        return [[{ db: 'other' }]];
      },
    }),
    /exact DEV/,
  );
  assert.equal(calls, 1);
});
