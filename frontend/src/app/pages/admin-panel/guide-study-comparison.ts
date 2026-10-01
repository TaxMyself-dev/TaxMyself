// 2026 ceilings: https://www.analyst.co.il/depositing-celings/
export const STUDY_LIMITS = { income: 293397, deduction: 13203, exemptDeposit: 20566 };
export const STUDY_EXAMPLE = { maxDeposit: 20000, income: 250000 };
export interface StudyInput { deposit: number; rate: number; years: number; growth: number; income: number; }
const bound = (n: number, low: number, high: number) => Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : low;
export function compareStudyFund(input: StudyInput) {
  const deposit = bound(input.deposit, 0, STUDY_EXAMPLE.maxDeposit);
  const years = Math.floor(bound(input.years, 6, 30));
  const growth = bound(input.growth, 0, 10);
  const deductible = Math.min(deposit, STUDY_LIMITS.deduction, .045 * bound(input.income, 0, STUDY_LIMITS.income));
  const savingNow = deductible * bound(input.rate, 0, 47) / 100;
  // Equal deposits at the START of each year, liquidated after the final year.
  const totalDeposits = deposit * years;
  let grossBalance = 0;
  for (let year = 0; year < years; year++) grossBalance = (grossBalance + deposit) * (1 + growth / 100);
  const gain = Math.max(0, grossBalance - totalDeposits);
  const tradingTax = gain * .25;
  const fundTax = deposit ? tradingTax * Math.max(0, 1 - STUDY_LIMITS.exemptDeposit / deposit) : 0;
  return { deductible, savingNow, totalDeposits, totalTaxSaving: savingNow * years, gain, tradingTax, fundTax,
    savingLater: tradingTax - fundTax,
    fundBalance: grossBalance - fundTax, tradingBalance: grossBalance - tradingTax };
}
