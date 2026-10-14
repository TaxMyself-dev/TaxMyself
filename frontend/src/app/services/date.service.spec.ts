import { DateService } from './date.service';

describe('DateService date-only API normalization', () => {
  const service = new DateService();

  for (const [input, expected] of [
    ['01/02/2026', '2026-02-01'],
    ['31-03-2026', '2026-03-31'],
    ['2026-02-01', '2026-02-01'],
  ]) {
    it(`normalizes ${input} to ${expected}`, () => {
      expect(service.toIsoDate(input)).toBe(expected);
    });
  }

  it('rejects an empty value', () => {
    expect(() => service.toIsoDate('')).toThrow('תאריך לא תקין');
  });
});
