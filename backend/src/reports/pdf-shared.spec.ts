import { fmtMoney } from './pdf-shared';

describe('PDF money formatting', () => {
  it('keeps two decimal places when requested by the P&L report', () => {
    expect(fmtMoney(1234.5, 2)).toContain('1,234.50');
    expect(fmtMoney(-98.126, 2)).toContain('-98.13');
    expect(fmtMoney(42, 2)).toContain('42.00');
  });

  it('keeps the existing whole-number default for other reports', () => {
    expect(fmtMoney(1234.5)).toContain('1,235');
  });
});
