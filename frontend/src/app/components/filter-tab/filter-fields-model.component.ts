import { Signal } from '@angular/core';
import { ReportingPeriodType } from 'src/app/shared/enums';
import { ISelectItem } from 'src/app/shared/interface';

export type FilterFieldType =
  | 'select'
  | 'date'
  | 'date-range'
  | 'period'
  | 'text'
  | 'number';

export interface PeriodDefaults {
  periodMode?: ReportingPeriodType;
  year?: number;
  month?: number;
  startDate?: string;
  endDate?: string;
}

export interface FilterField {
  type: FilterFieldType;
  controlName: string;

  label?: string;
  placeholder?: string;

  // Supports static arrays OR signals
  options?: ISelectItem[] | Signal<ISelectItem[]>;

  required?: boolean;
  defaultValue?: any;
  allowedPeriodModes?: ReportingPeriodType[];
  periodDefaults?: PeriodDefaults;
}