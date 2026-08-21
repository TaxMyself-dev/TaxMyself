import { BadRequestException } from '@nestjs/common';
import { Expense } from '../expenses/expenses.entity';

export interface DepreciationYearCalculation {
  taxYear: number;
  activationDate: string;
  originalCost: number;
  depreciationRate: number;
  activeDays: number;
  daysInYear: number;
  amount: number;
  accumulatedThroughYear: number;
  remainingBalance: number;
}

export function dateOnly(value: Date | string): string {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const candidate = match[1];
      const parsed = new Date(`${candidate}T00:00:00.000Z`);
      if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate) {
        return candidate;
      }
      throw new BadRequestException('תאריך הפעלה אינו תקין');
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('תאריך הפעלה אינו תקין');
  }
  return date.toISOString().slice(0, 10);
}

export function daysInTaxYear(year: number): number {
  return new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365;
}

function inclusiveDays(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00.000Z`);
  const to = Date.parse(`${toIso}T00:00:00.000Z`);
  return Math.floor((to - from) / 86_400_000) + 1;
}

/**
 * Deterministic annual schedule. The first year is prorated daily from the
 * activation date; later years take a full annual amount; the final year is
 * capped so accumulated depreciation never exceeds original cost.
 */
export function calculateDepreciationSchedule(
  expense: Pick<Expense, 'date' | 'activationDate' | 'sum' | 'reductionPercentSnapshot'>,
  throughYear: number,
): DepreciationYearCalculation[] {
  const purchaseDate = dateOnly(expense.date as any);
  const activationDate = dateOnly((expense.activationDate ?? expense.date) as any);
  if (activationDate < purchaseDate) {
    throw new BadRequestException('תאריך הפעלת הנכס לא יכול להיות מוקדם מתאריך הרכישה');
  }

  const activationYear = Number(activationDate.slice(0, 4));
  if (!Number.isInteger(throughYear) || throughYear < activationYear) return [];

  const originalCost = Number(expense.sum) || 0;
  const depreciationRate = Number(expense.reductionPercentSnapshot) || 0;
  if (originalCost < 0) {
    throw new BadRequestException('עלות הנכס לא יכולה להיות שלילית');
  }
  if (depreciationRate < 0 || depreciationRate > 100) {
    throw new BadRequestException('אחוז הפחת חייב להיות בין 0 ל-100');
  }
  if (originalCost === 0 || depreciationRate === 0) return [];

  const annualAmount = originalCost * (depreciationRate / 100);
  const rows: DepreciationYearCalculation[] = [];
  let accumulated = 0;

  for (let year = activationYear; year <= throughYear && accumulated < originalCost; year++) {
    const days = daysInTaxYear(year);
    const activeDays = year === activationYear
      ? inclusiveDays(activationDate, `${year}-12-31`)
      : days;
    const uncapped = annualAmount * (activeDays / days);
    const amount = Number(Math.min(uncapped, originalCost - accumulated).toFixed(2));
    if (amount <= 0) break;
    accumulated = Number((accumulated + amount).toFixed(2));
    if (accumulated > originalCost) accumulated = originalCost;

    rows.push({
      taxYear: year,
      activationDate,
      originalCost,
      depreciationRate,
      activeDays,
      daysInYear: days,
      amount,
      accumulatedThroughYear: accumulated,
      remainingBalance: Number(Math.max(0, originalCost - accumulated).toFixed(2)),
    });
  }

  return rows;
}
