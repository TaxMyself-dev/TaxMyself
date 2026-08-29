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
