import { calculateExpenseSavings, ExpenseSavingsInput } from './guide-expense-savings';
describe('Expense savings teaching model', () => {
  const base: ExpenseSavingsInput = {businessType:'authorized',revenue:120000,expenses:1180,taxPercent:20,insurancePercent:18,vatEligible:true};
  it('separates recoverable VAT before computing profit-based savings', () => {
    const r = calculateExpenseSavings(base);
    expect(r.vat).toBeCloseTo(180,6); expect(r.deductible).toBeCloseTo(1000,6);
    expect(r.tax).toBeCloseTo(200,6); expect(r.insurance).toBeCloseTo(180,6);
    expect(r.total).toBeCloseTo(560,6); expect(r.cost).toBeCloseTo(620,6);
  });
  it('includes nonrecoverable VAT in exempt dealer costs', () => {
    const r = calculateExpenseSavings({...base,businessType:'exempt'});
    expect(r.vat).toBe(0); expect(r.deductible).toBe(1180); expect(r.total).toBeCloseTo(448.4,6);
  });
  it('does not credit VAT when the expense has no eligible input VAT', () => {
    expect(calculateExpenseSavings({...base,vatEligible:false}).vat).toBe(0);
  });
  it('allows zero liability without removing VAT entitlement', () => {
    const r = calculateExpenseSavings({...base,taxPercent:0,insurancePercent:0});
    expect(r.total).toBeCloseTo(180,6);
  });
  it('caps immediate profit savings at positive income, not VAT', () => {
    const r = calculateExpenseSavings({...base,revenue:100});
    expect(r.profit).toBe(0); expect(r.tax).toBeCloseTo(20,6); expect(r.insurance).toBeCloseTo(18,6);
    expect(r.loss).toBeCloseTo(900,6); expect(r.vat).toBeCloseTo(180,6);
  });
  it('handles zero and invalid values without negative or nonfinite results', () => {
    expect(calculateExpenseSavings({...base,expenses:0}).total).toBe(0);
    const r=calculateExpenseSavings({...base,revenue:NaN,expenses:-10,taxPercent:Infinity});
    expect(r.total).toBe(0); expect(r.savingsPercent).toBe(0);
  });
  it('keeps total benefit no greater than expenditure across the supported range', () => {
    for(const expenses of [0,1180,200000]) for(const revenue of [0,500,500000]) {
      const r=calculateExpenseSavings({...base,revenue,expenses,taxPercent:99,insurancePercent:99});
      expect(r.total).toBeLessThanOrEqual(expenses); expect(r.cost).toBeGreaterThanOrEqual(0);
    }
  });
});
