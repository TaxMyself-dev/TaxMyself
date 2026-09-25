/** Linear teaching illustration, NOT a tax/NI assessment. See docs/marketing/expense-savings-slides.md. */
export const EXPENSE_VAT_RATE = 0.18;
export type ExpenseBusinessType = 'exempt' | 'authorized';
export interface ExpenseSavingsItem {
  amount: number;
  taxRecognition: number;
  vatRecognition: number;
}
export interface ExpenseSavingsInput {
  businessType: ExpenseBusinessType;
  expenses: number;
  taxPercent: number;
  insurancePercent: number;
  vatEligible: boolean;
  items?: ExpenseSavingsItem[];
}
const bounded = (n: number, max: number) => Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
export function calculateExpenseSavings(input: ExpenseSavingsInput) {
  const items = input.items ?? [{ amount: input.expenses, taxRecognition: 100, vatRecognition: 100 }];
  let expenses = 0, vat = 0, deductible = 0;
  for (const item of items) {
    const amount = bounded(item.amount, 1_000_000);
    const recoverableVat = input.businessType === 'authorized' && input.vatEligible
      ? amount * EXPENSE_VAT_RATE / (1 + EXPENSE_VAT_RATE) * bounded(item.vatRecognition, 100) / 100 : 0;
    expenses += amount;
    vat += recoverableVat;
    deductible += (amount - recoverableVat) * bounded(item.taxRecognition, 100) / 100;
  }
  // Illustration assumes sufficient taxable profit at the selected marginal rates.
  const reduction = deductible;
  const tax = reduction * bounded(input.taxPercent, 50) / 100;
  const insurance = reduction * bounded(input.insurancePercent, 18) / 100;
  const total = tax + insurance + vat;
  return { expenses, vat, deductible, reduction, tax, insurance, total,
    cost: expenses - total, savingsPercent: expenses ? total / expenses * 100 : 0 };
}
