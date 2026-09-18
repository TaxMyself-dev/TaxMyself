import { calculateGuideInsurance as calc, boundedNumber, NI_2026 as f } from './guide-national-insurance';

describe('National Insurance educational calculation 2026', () => {
  it('reproduces the approved default: small side business plus salary', () => {
    const r = calc(2000, 10000, 8);
    expect(r.qualifies).toBeFalse();
    expect(r.base).toBe(0);
    expect(r.total).toBe(0);
  });
  it('uses inclusive independent definition thresholds', () => {
    expect(calc(0, 0, 20).qualifies).toBeTrue();
    expect(calc(6885, 0, 0).qualifies).toBeTrue();
    expect(calc(6884, 0, 0).qualifies).toBeFalse();
    expect(calc(2065, 0, 12).qualifies).toBeTrue();
    expect(calc(2064, 0, 12).qualifies).toBeFalse();
    expect(calc(2065, 0, 11).qualifies).toBeFalse();
  });
  it('applies the passive exemption without subtracting it from salary', () => {
    expect(calc(3442, 10000, 8).total).toBe(0);
    const r = calc(5000, 10000, 8);
    expect(r.base).toBe(1558);
    expect(r.lowerBase).toBe(0);
    expect(r.total).toBeCloseTo(1558 * .1217, 1);
  });
  it('distinguishes passive minimum from the self-employed minimum', () => {
    expect(calc(2000, 0, 8).total).toBe(266);
    expect(calc(2000, 0, 8).minimumTopUp).toBe(266);
    const r = calc(0, 0, 20);
    expect(r.base).toBe(3442);
    expect(r.total).toBe(265.03);
    expect(r.minimumSelfApplied).toBeTrue();
    expect(calc(0, 5000, 20).total).toBe(0);
  });
  it('uses salary first in reduced and maximum bands', () => {
    const partial = calc(12000, 5000, 20);
    expect(partial.lowerBase).toBe(2703);
    expect(partial.upperBase).toBeGreaterThan(0);
    expect(calc(12000, 7703, 20).lowerBase).toBe(0);
    expect(calc(100000, 51910, 20).total).toBe(0);
    expect(calc(100000, 50000, 20).base).toBe(1910);
  });
  it('implements the official 52% NI-only deduction formula', () => {
    const r = calc(12000, 0, 20);
    const expected = (12000 + 7703 * .52 * (.1283 - .0447)) / (1 + .52 * .1283);
    expect(r.base).toBeCloseTo(expected, 8);
    expect(r.total).toBeCloseTo(7703 * .077 + (expected - 7703) * .18, 1);
    expect(r.base + r.adjustment).toBeCloseTo(12000, 8);
  });
  it('applies passive reduced rate only to remaining salary band', () => {
    const r = calc(6000, 7000, 8);
    expect(r.qualifies).toBeFalse();
    expect(r.lowerBase).toBe(703);
    expect(r.upperBase).toBe(1855);
    expect(r.total).toBeCloseTo(703 * .1209 + 1855 * .1217, 1);
  });
  it('does not create negative or nonfinite results from invalid inputs', () => {
    expect(boundedNumber(Infinity, 80)).toBe(0);
    expect(boundedNumber(-10, 80)).toBe(0);
    expect(boundedNumber(200, 80)).toBe(80);
    const r = calc(NaN, -10, Infinity);
    expect(r.total).toBe(266);
    expect(Number.isFinite(r.base)).toBeTrue();
  });
  it('keeps all bases within shared caps across the supported input space', () => {
    for (const p of [0, 2000, 3442, 6885, 7703, 12000, 51910, 100000]) {
      for (const s of [0, 1000, 5000, 7703, 50000, 51910, 100000]) {
        for (const h of [0, 8, 12, 20]) {
          const r = calc(p, s, h);
          expect(r.total).toBeGreaterThanOrEqual(0);
          expect(r.base).toBeLessThanOrEqual(Math.max(0, f.maximumIncome - s));
          expect(r.lowerBase + r.upperBase).toBeCloseTo(r.base, 8);
        }
      }
    }
  });
});
