import { calculateAnnualIncomeTax, calculateTaxFilePlanning } from './tax-file-planning';

describe('tax file planning', () => {
  it('combines projected business profit and salary without double-counting credits', () => {
    const result = calculateTaxFilePlanning({
      actualIncome: 100_000,
      actualExpenses: 25_000,
      actualProfit: 75_000,
      yearProgress: 0.5,
      monthlySalary: 8_000,
      creditPoints: 2.25,
      incomeTaxPaid: 5_000,
      nationalInsurancePaid: 3_000,
      nationalInsuranceRequired: true,
    });

    expect(result.projectedProfit).toBe(150_000);
    expect(result.annualSalary).toBe(96_000);
    expect(result.combinedIncome).toBe(246_000);
    expect(result.incomeTax).toBe(calculateAnnualIncomeTax(246_000, 2.25));
    expect(result.incomeTaxBalance).toBe(
      Math.max(0, result.incomeTax - result.estimatedSalaryTax - 5_000),
    );
  });

  it('keeps paid balances unknown until the admin supplies actual payments', () => {
    const result = calculateTaxFilePlanning({
      actualIncome: 50_000,
      actualExpenses: 10_000,
      actualProfit: 40_000,
      yearProgress: 1,
      monthlySalary: 0,
      creditPoints: 2.25,
      nationalInsuranceRequired: false,
    });

    expect(result.incomeTaxBalance).toBeNull();
    expect(result.nationalInsuranceBalance).toBeNull();
    expect(result.totalKnownBalance).toBeNull();
  });

  it('never projects negative amounts from malformed input', () => {
    const result = calculateTaxFilePlanning({
      actualIncome: -1,
      actualExpenses: -1,
      actualProfit: -1,
      yearProgress: 0,
      monthlySalary: -1,
      creditPoints: -1,
      incomeTaxPaid: 0,
      nationalInsurancePaid: 0,
      nationalInsuranceRequired: true,
    });

    expect(result.projectedProfit).toBe(0);
    expect(result.combinedIncome).toBe(0);
    expect(result.incomeTax).toBe(0);
  });
});
