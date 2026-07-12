/**
 * Unit tests: Phase 4.4 (D7) — ledger "פירוט" text comes from the STORED
 * journal_entry.description for expense-account lines, with the legacy
 * jl.subCategoryName snapshot as fallback; technical/income/bank lines keep
 * their computed labels.
 *
 * buildLineDescription is private — invoked via the prototype.call pattern
 * (same approach as document-kind.spec.ts) so the huge ReportsService never
 * needs full DI wiring here.
 */
import { ReportsService } from './reports.service';

function describeLine(
  accountCode: string,
  accountType: string | null,
  referenceType: string | null,
  subCategoryName: string | null,
  entryDescription: string | null,
): string {
  return (ReportsService.prototype as any).buildLineDescription.call(
    {},
    accountCode,
    accountType,
    referenceType,
    subCategoryName,
    entryDescription,
  );
}

describe('ReportsService.buildLineDescription — D7 stored descriptions', () => {
  it('expense line: stored entry description wins', () => {
    expect(describeLine('60200', 'expense', 'EXPENSE', 'דלק', 'רכב ותחבורה/דלק'))
      .toBe('רכב ותחבורה/דלק');
  });

  it('expense line without a stored description falls back to subCategoryName (pre-backfill rows)', () => {
    expect(describeLine('60200', 'expense', 'EXPENSE', 'דלק', null)).toBe('דלק');
    expect(describeLine('60200', 'expense', 'EXPENSE', 'דלק', '   ')).toBe('דלק');
  });

  it('expense line with neither falls through to the movement label', () => {
    expect(describeLine('60200', 'expense', 'EXPENSE', null, null)).toBe('הוצאה');
    expect(describeLine('80010', 'expense', 'MANUAL', null, null)).toBe('תנועה');
  });

  it('VAT lines keep their computed labels even when the entry has a description', () => {
    expect(describeLine('2410', 'asset', 'EXPENSE', null, 'רכב ותחבורה/דלק'))
      .toBe('מע"מ תשומות בגין הוצאה');
    expect(describeLine('2400', 'liability', 'CREDIT_INVOICE', null, 'הכנסה כלשהי'))
      .toBe('מע"מ עסקאות - חשבונית זיכוי');
  });

  it('income lines keep the referenceType-driven labels', () => {
    expect(describeLine('40000', 'income', 'TAX_INVOICE', null, 'תיאור מסמך')).toBe('חשבונית מס');
    expect(describeLine('40000', 'income', 'RECEIPT', null, null)).toBe('קבלה');
    expect(describeLine('40010', 'income', null, null, null)).toBe('הכנסה פטורה');
  });

  it('bank / A-R / A-P lines keep their computed labels', () => {
    expect(describeLine('1100', 'asset', 'EXPENSE', null, 'רכב ותחבורה/דלק')).toBe('תשלום לספק');
    expect(describeLine('1200', 'asset', 'RECEIPT', null, null)).toBe('סגירת חוב לקוח');
    expect(describeLine('2000', 'liability', null, null, null)).toBe('חוב לספק');
  });

  it('pre-4.4 behavior preserved: a non-expense line carrying subCategoryName still shows it', () => {
    expect(describeLine('1100', 'asset', 'EXPENSE', 'דלק', null)).toBe('דלק');
  });
});
