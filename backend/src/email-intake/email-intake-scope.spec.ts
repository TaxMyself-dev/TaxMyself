import { assertEmailIntakeScope } from './email-intake-scope';
const keys = [
  'GMAIL_DURABLE_ALLOWED_INTEGRATION_IDS',
  'GMAIL_DURABLE_REQUIRED_BUSINESS_NUMBER',
];
const saved = keys.map((key) => process.env[key]);
afterEach(() =>
  keys.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key];
    else process.env[key] = saved[i];
  }),
);
it('accepts only the configured mailbox and the already resolved business', () => {
  process.env[keys[0]] = '17';
  process.env[keys[1]] = 'synthetic-business';
  expect(() => assertEmailIntakeScope(17, 'synthetic-business')).not.toThrow();
  expect(() => assertEmailIntakeScope(18, 'synthetic-business')).toThrow();
  expect(() => assertEmailIntakeScope(17, 'other-business')).toThrow();
});
it.each(['', '17,', 'abc', '0', '-1'])(
  'fails closed for malformed scope %s',
  (value) => {
    process.env[keys[0]] = value;
    expect(() => assertEmailIntakeScope(17)).toThrow();
  },
);
it('preserves default routing when rollout bounds are not configured', () => {
  keys.forEach((key) => delete process.env[key]);
  expect(() => assertEmailIntakeScope(18, 'any-owned-business')).not.toThrow();
});
