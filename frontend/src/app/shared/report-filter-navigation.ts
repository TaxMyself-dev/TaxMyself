import { PeriodDefaults } from "../components/filter-tab/filter-fields-model.component";
import { ReportingPeriodType } from "./enums";

export interface ReportFilterQueryParams {
  filterPeriodMode?: ReportingPeriodType;
  filterYear?: number;
  filterMonth?: string;
  filterStartDate?: string;
  filterEndDate?: string;
}

interface QueryParamReader {
  get(name: string): string | null;
}

export function reportFilterQueryFromFormValue(
  value: any
): ReportFilterQueryParams {
  return {
    filterPeriodMode: value?.periodMode,
    filterYear: value?.year,
    filterMonth: value?.month != null ? String(value.month) : undefined,
    filterStartDate: value?.startDate,
    filterEndDate: value?.endDate,
  };
}

export function reportFilterQueryFromParamMap(
  params: QueryParamReader
): ReportFilterQueryParams {
  const periodMode = params.get(
    "filterPeriodMode"
  ) as ReportingPeriodType | null;
  const year = Number(params.get("filterYear"));

  return {
    filterPeriodMode: periodMode ?? undefined,
    filterYear: Number.isFinite(year) && year > 0 ? year : undefined,
    filterMonth: params.get("filterMonth") ?? undefined,
    filterStartDate: params.get("filterStartDate") ?? undefined,
    filterEndDate: params.get("filterEndDate") ?? undefined,
  };
}

export function reportPeriodDefaultsFromQuery(
  params: QueryParamReader,
  fallback: PeriodDefaults
): PeriodDefaults {
  const state = reportFilterQueryFromParamMap(params);
  const validModes = Object.values(ReportingPeriodType);

  if (!state.filterPeriodMode || !validModes.includes(state.filterPeriodMode)) {
    return fallback;
  }

  return {
    ...fallback,
    periodMode: state.filterPeriodMode,
    year: state.filterYear ?? fallback.year,
    month: state.filterMonth ?? fallback.month,
    startDate: state.filterStartDate ?? fallback.startDate,
    endDate: state.filterEndDate ?? fallback.endDate,
  };
}
