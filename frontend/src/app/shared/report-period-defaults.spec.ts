import { ReportingPeriodType } from './enums';
import {
  getPreviousVatPeriodDefault,
} from './report-period-defaults';

describe('report period defaults', () => {
  it('uses September-October for a bimonthly VAT report opened in November', () => {
    expect(getPreviousVatPeriodDefault(
      new Date(2026, 10, 19),
      ReportingPeriodType.BIMONTHLY,
    )).toEqual({ year: 2026, month: '9' });

    expect(getPreviousVatPeriodDefault(
      new Date(2026, 11, 1),
      ReportingPeriodType.BIMONTHLY,
    )).toEqual({ year: 2026, month: '9' });
  });

  it('uses the previous month for monthly VAT reporting', () => {
    expect(getPreviousVatPeriodDefault(
      new Date(2026, 10, 19),
      ReportingPeriodType.MONTHLY,
    )).toEqual({ year: 2026, month: '10' });
  });

  it('rolls a previous bimonthly VAT period into the preceding year', () => {
    expect(getPreviousVatPeriodDefault(
      new Date(2026, 0, 15),
      ReportingPeriodType.BIMONTHLY,
    )).toEqual({ year: 2025, month: '11' });
  });
});
