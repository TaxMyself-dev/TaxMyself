/** Linear teaching illustration, NOT a tax/NI assessment. See docs/marketing/expense-savings-slides.md. */
export const EXPENSE_VAT_RATE = 0.18;
export type ExpenseBusinessType = 'exempt' | 'authorized';
export interface ExpenseSavingsInput {
  businessType: ExpenseBusinessType;
  expenses: number;
  taxPercent: number;
  insurancePercent: number;
  vatEligible: boolean;
}
const bounded = (n: number, max: number) => Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
export function calculateExpenseSavings(input: ExpenseSavingsInput) {
  const expenses = bounded(input.expenses, 1_000_000);
  const vat = input.businessType === 'authorized' && input.vatEligible
    ? expenses * EXPENSE_VAT_RATE / (1 + EXPENSE_VAT_RATE) : 0;
  const deductible = expenses - vat;
  // Illustration assumes sufficient taxable profit at the selected marginal rates.
  const reduction = deductible;
  const tax = reduction * bounded(input.taxPercent, 50) / 100;
  const insurance = reduction * bounded(input.insurancePercent, 18) / 100;
  const total = tax + insurance + vat;
  return { expenses, vat, deductible, reduction, tax, insurance, total,
    cost: expenses - total, savingsPercent: expenses ? total / expenses * 100 : 0 };
}
