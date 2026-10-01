// 2026 ceilings: https://www.analyst.co.il/depositing-celings/
export const STUDY_LIMITS = { income: 293397, deduction: 13203, exemptDeposit: 20566 };
export interface StudyInput { deposit: number; rate: number; years: number; growth: number; income: number; }
const bound = (n: number, low: number, high: number) => Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : low;
export function compareStudyFund(input: StudyInput) {
  const deposit = bound(input.deposit, 0, 100000);
  const years = bound(input.years, 6, 30);
  const growth = bound(input.growth, 0, 10);
  const deductible = Math.min(deposit, STUDY_LIMITS.deduction, .045 * bound(input.income, 0, STUDY_LIMITS.income));
  const savingNow = deductible * bound(input.rate, 0, 47) / 100;
  const gain = deposit * (Math.pow(1 + growth / 100, years) - 1);
  const tradingTax = gain * .25;
  const fundTax = deposit ? tradingTax * Math.max(0, 1 - STUDY_LIMITS.exemptDeposit / deposit) : 0;
  return { deductible, savingNow, gain, tradingTax, fundTax,
    savingLater: tradingTax - fundTax,
    fundBalance: deposit + gain - fundTax, tradingBalance: deposit + gain - tradingTax };
}
