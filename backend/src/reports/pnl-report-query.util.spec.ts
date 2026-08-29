import { parseBooleanQueryFlag } from './pnl-report-query.util';

describe('parseBooleanQueryFlag', () => {
  it.each([true, 'true', 'TRUE', ' true '])(
    'recognizes an enabled query flag represented as %p',
    (value) => {
      expect(parseBooleanQueryFlag(value)).toBe(true);
    },
  );

  it.each([false, 'false', undefined, null, '', '1'])(
    'does not enable the flag for %p',
    (value) => {
      expect(parseBooleanQueryFlag(value)).toBe(false);
    },
  );
});
