import { ASSISTANT_QA_PROFILE as profile, QA_EXPENSES, QA_MAIN, QA_SECOND, QA_SALES } from './assistant-qa.profile';

describe('assistant QA deterministic fixture', () => {
  it('is isolated and synthetic, with no reset capability or delegated users', () => {
    expect(profile.id).toBe('assistant-qa');
    expect(profile.syntheticOpenBanking).toBe(true);
    expect(profile.allowSelfReset).not.toBe(true);
    expect(profile.delegatedClients).toBeUndefined();
    expect(new Set(profile.businesses.map(b=>b.businessNumber)).size).toBe(2);
  });
  it('has stable dates, valid sources and deterministic fuel totals', () => {
    const sources = new Set(profile.bills.flatMap(b=>b.sources.map(s=>s.sourceName)));
    expect(profile.transactions).toHaveLength(32);
    for(const tx of profile.transactions) {
      expect(tx.transactionDate).toMatch(/^2026-(08|09|10|11)-\d{2}$/);
      expect(tx.daysAgo).toBeUndefined();
      expect(sources.has(tx.paymentIdentifier!)).toBe(true);
    }
    const fuel=(biz:string)=>QA_EXPENSES.filter(e=>e.business===biz&&e.sub==='דלק'&&e.state==='approved').reduce((s,e)=>s+e.sum,0);
    expect(fuel(QA_MAIN)).toBe(2360);
    expect(fuel(QA_SECOND)).toBe(708);
  });
  it('contains approval, privacy and multi-month income cases', () => {
    expect(QA_EXPENSES.filter(e=>e.state==='approved')).toHaveLength(20);
    expect(QA_EXPENSES.filter(e=>e.state==='pending')).toHaveLength(2);
    expect(QA_EXPENSES.filter(e=>e.state==='private')).toHaveLength(1);
    expect(QA_SALES.filter(s=>s.business===QA_MAIN).reduce((n,s)=>n+s.net,0)).toBe(7000);
    expect(QA_SALES.filter(s=>s.business===QA_SECOND).reduce((n,s)=>n+s.net,0)).toBe(1500);
  });
});
