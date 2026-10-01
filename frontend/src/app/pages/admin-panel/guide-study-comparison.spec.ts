import { compareStudyFund } from './guide-study-comparison';
describe('study fund illustration', () => {
  const base = { deposit: 10000, rate: 31, years: 6, growth: 5, income: 250000 };
  it('keeps current tax saving separate from future balances', () => {
    const r = compareStudyFund(base);
    expect(r.savingNow).toBe(3100);
    expect(r.totalDeposits).toBe(60000);
    expect(r.totalTaxSaving).toBe(18600);
    expect(Math.round(r.savingLater)).toBe(2855);
    expect(Math.round(r.fundBalance)).toBe(71420);
    expect(Math.round(r.tradingBalance)).toBe(68565);
  });
  it('caps deductions by income and taxes gains on excess deposits', () => {
    expect(compareStudyFund({ ...base, income: 100000 }).deductible).toBe(4500);
    const r = compareStudyFund({ ...base, deposit: 100000, income: 1000000 });
    expect(r.deductible).toBeLessThanOrEqual(13203);
    expect(r.fundTax).toBeGreaterThan(0);
  });
  it('handles zero inputs and prevents early exempt withdrawal', () => {
    expect(compareStudyFund({ ...base, income: 0 }).savingNow).toBe(0);
    expect(compareStudyFund({ ...base, deposit: 0 }).fundBalance).toBe(0);
    expect(compareStudyFund({ ...base, growth: 0 }).savingLater).toBe(0);
    expect(compareStudyFund({ ...base, growth: 0 }).fundBalance).toBe(60000);
    expect(compareStudyFund({ ...base, years: 1 }).fundBalance).toBe(compareStudyFund(base).fundBalance);
  });
});
