'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  developmentOptions,
  assertDevelopmentDatabase,
  cleanupOwners,
} = require('./onboarding-test-target.cjs');
const env = {
  ONBOARDING_APPROVED_DATABASE: 'keepintax-dev',
  DB_DATABASE: 'keepintax-dev',
  DB_HOST: 'fixture.invalid',
  DB_USERNAME: 'fixture',
  DB_PORT: '3306',
};
test('requires the exact approved database and acknowledgment', () => {
  assert.equal(developmentOptions(env).database, 'keepintax-dev');
  assert.throws(
    () => developmentOptions({ ...env, DB_DATABASE: 'keepintax-prod' }),
    /NOT_APPROVED/,
  );
  assert.throws(
    () => developmentOptions({ ...env, ONBOARDING_APPROVED_DATABASE: '' }),
    /NOT_APPROVED/,
  );
});
test('rejects invalid connection configuration before opening a connection', () => {
  assert.throws(
    () => developmentOptions({ ...env, DB_PORT: 'invalid' }),
    /CONFIG_INVALID/,
  );
  assert.throws(
    () => developmentOptions({ ...env, DB_HOST: '' }),
    /CONFIG_INVALID/,
  );
});
test('checks the actual connected database independently of configuration', async () => {
  await assert.rejects(
    assertDevelopmentDatabase({
      query: async () => [{ selected_database: 'keepintax-prod' }],
    }),
    /MISMATCH/,
  );
  await assertDevelopmentDatabase({
    query: async () => [{ selected_database: 'keepintax-dev' }],
  });
});
test('cleanup refuses unscoped or real-user identifiers before any SQL', async () => {
  const db = {
    transaction: () => {
      throw new Error('SQL should not run');
    },
  };
  await assert.rejects(cleanupOwners(db, []), /SCOPE_INVALID/);
  await assert.rejects(cleanupOwners(db, ['real-user']), /SCOPE_INVALID/);
  await assert.rejects(
    cleanupOwners(db, ['onboarding-qa-%-alice']),
    /SCOPE_INVALID/,
  );
});
