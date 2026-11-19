import { ReportingPeriodType } from './enums';

export interface ReportPeriodDefault {
  year: number;
  month: string;
}

/** Returns the first month of the most recently completed VAT period. */
export function getPreviousVatPeriodDefault(
  now: Date,
  periodMode: ReportingPeriodType.MONTHLY | ReportingPeriodType.BIMONTHLY,
): ReportPeriodDefault {
  const currentMonthIndex = now.getMonth();
  const periodLength = periodMode === ReportingPeriodType.BIMONTHLY ? 2 : 1;
  const currentPeriodStartIndex = periodMode === ReportingPeriodType.BIMONTHLY
    ? currentMonthIndex - (currentMonthIndex % 2)
    : currentMonthIndex;
  const previousPeriodStart = new Date(
    now.getFullYear(),
    currentPeriodStartIndex - periodLength,
    1,
  );

  return {
    year: previousPeriodStart.getFullYear(),
    month: String(previousPeriodStart.getMonth() + 1),
  };
}
