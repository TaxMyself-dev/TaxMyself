const test = require('node:test');
const assert = require('node:assert/strict');
const { localOnboardingValue } = require('./local-onboarding-config.cjs');
test('no local config preserves environment and main defaults', () => {
  assert.equal(localOnboardingValue(null, {}, {}), undefined);
  assert.equal(
    localOnboardingValue(null, {}, { AGENT_ONBOARDING_ENABLED: 'false' }),
    'false',
  );
});
test('an ignored local option enables onboarding without editing .env', () =>
  assert.equal(
    localOnboardingValue({ onboardingEnabled: true }, {}, {}),
    'true',
  ));
test('explicit process setting takes precedence', () =>
  assert.equal(
    localOnboardingValue(
      { onboardingEnabled: true },
      { AGENT_ONBOARDING_ENABLED: 'false' },
      {},
    ),
    'false',
  ));
test('invalid local flags are rejected', () =>
  assert.throws(
    () => localOnboardingValue({ onboardingEnabled: 'true' }, {}, {}),
    /Invalid/,
  ));
