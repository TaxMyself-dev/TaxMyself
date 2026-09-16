import { ReportingPeriodType } from "./enums";
import {
  reportFilterQueryFromFormValue,
  reportFilterQueryFromParamMap,
  reportPeriodDefaultsFromQuery,
} from "./report-filter-navigation";

const paramMap = (values: Record<string, string>) => ({
  get: (name: string) => values[name] ?? null,
});

describe("report filter navigation state", () => {
  it("serializes the selected annual period", () => {
    expect(
      reportFilterQueryFromFormValue({
        periodMode: ReportingPeriodType.ANNUAL,
        year: 2025,
      })
    ).toEqual({
      filterPeriodMode: ReportingPeriodType.ANNUAL,
      filterYear: 2025,
      filterMonth: undefined,
      filterStartDate: undefined,
      filterEndDate: undefined,
    });
  });

  it("restores the selected annual period instead of the current-month fallback", () => {
    const params = paramMap({
      filterPeriodMode: ReportingPeriodType.ANNUAL,
      filterYear: "2025",
    });

    expect(
      reportPeriodDefaultsFromQuery(params, {
        periodMode: ReportingPeriodType.MONTHLY,
        year: 2026,
        month: "8",
      })
    ).toEqual({
      periodMode: ReportingPeriodType.ANNUAL,
      year: 2025,
      month: "8",
      bimonthlyDefaultMonth: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  });

  it("restores a prior bimonthly selection for the period selector", () => {
    const selected = reportFilterQueryFromFormValue({
      periodMode: ReportingPeriodType.BIMONTHLY,
      year: 2025,
      month: "7",
    });
    const params = paramMap({
      filterPeriodMode: selected.filterPeriodMode!,
      filterYear: String(selected.filterYear),
      filterMonth: selected.filterMonth!,
    });

    expect(
      reportPeriodDefaultsFromQuery(params, {
        periodMode: ReportingPeriodType.BIMONTHLY,
        year: 2026,
        month: "1",
        bimonthlyDefaultMonth: "1",
      })
    ).toEqual({
      periodMode: ReportingPeriodType.BIMONTHLY,
      year: 2025,
      month: "7",
      bimonthlyDefaultMonth: "7",
      startDate: undefined,
      endDate: undefined,
    });
  });

  it("preserves filter params while the review page returns to the report", () => {
    expect(
      reportFilterQueryFromParamMap(
        paramMap({
          filterPeriodMode: ReportingPeriodType.BIMONTHLY,
          filterYear: "2024",
          filterMonth: "11",
        })
      )
    ).toEqual({
      filterPeriodMode: ReportingPeriodType.BIMONTHLY,
      filterYear: 2024,
      filterMonth: "11",
      filterStartDate: undefined,
      filterEndDate: undefined,
    });
  });
});
