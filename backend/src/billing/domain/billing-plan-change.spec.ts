import { proratedDifference } from './billing-plan-change';

describe('paid plan change arithmetic', () => {
  const start = new Date('2026-09-07T09:00:00Z');
  const end = new Date('2026-10-07T09:00:00Z');
  it('charges only the difference for half of an actual paid period', () => {
    expect(proratedDifference(5000, 8000, start, end, new Date('2026-09-22T09:00:00Z'))).toBe(1500);
  });
  it('uses actual instants across DST rather than assuming thirty calendar days', () => {
    const a = new Date('2026-10-07T06:00:00Z'), b = new Date('2026-11-07T07:00:00Z');
    expect(proratedDifference(5000, 8000, a, b, new Date((a.getTime() + b.getTime()) / 2))).toBe(1500);
  });
  it('rounds once to agorot and never charges a negative difference', () => {
    expect(proratedDifference(100, 101, start, end, new Date('2026-09-08T09:00:00Z'))).toBe(1);
    expect(proratedDifference(8000, 5000, start, end, start)).toBe(0);
  });
  it('rejects an ended period and a quote predating service', () => {
    expect(() => proratedDifference(5000, 8000, start, end, end)).toThrow();
    expect(() => proratedDifference(5000, 8000, start, end, new Date('2026-09-01'))).toThrow();
  });
});
