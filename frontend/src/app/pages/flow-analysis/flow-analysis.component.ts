import { Component, effect, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { SegmentedControlComponent, SegmentedOption } from 'src/app/components/segmented-control/segmented-control.component';
import { SegmentContentDirective } from 'src/app/components/segmented-control/segment-content.directive';
import { CustomDateRangeComponent } from './custom-date-range.component';

function calculatePeriodRange(period: string): { dateFrom: Date | null; dateTo: Date | null } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (period) {
    case '3_MONTHS': {
      const dateFrom = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      return { dateFrom, dateTo: today };
    }
    case '6_MONTHS': {
      const dateFrom = new Date(today.getFullYear(), today.getMonth() - 5, 1);
      return { dateFrom, dateTo: today };
    }
    case 'YEAR': {
      const dateFrom = new Date(today);
      dateFrom.setFullYear(dateFrom.getFullYear() - 1);
      dateFrom.setDate(dateFrom.getDate() + 1);
      return { dateFrom, dateTo: today };
    }
    default:
      return { dateFrom: null, dateTo: null };
  }
}

const customRangeValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const fg = group as FormGroup;

  if (fg.get('period')?.value !== 'CUSTOM') return null;

  const dateFrom = fg.get('dateFrom')?.value as Date | null;
  const dateTo = fg.get('dateTo')?.value as Date | null;

  if (!dateFrom || !dateTo) return { customRangeRequired: true };

  const start = startOfDay(dateFrom);
  const end = startOfDay(dateTo);
  const today = startOfDay(new Date());

  if (end <= start) return { customRangeEndBeforeStart: true };

  if (isSameDate(end, today)) {
    const allowedStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    return start <= allowedStart ? null : { customRangeTooShort: true };
  }

  const minEnd = new Date(start.getFullYear(), start.getMonth() + 3, start.getDate());
  return end >= minEnd ? null : { customRangeTooShort: true };
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

@Component({
  selector: 'app-flow-analysis',
  templateUrl: './flow-analysis.component.html',
  styleUrls: ['./flow-analysis.component.scss'],
  imports: [SegmentedControlComponent, SegmentContentDirective, ReactiveFormsModule, CustomDateRangeComponent],
})
export class FlowAnalysisComponent {

  readonly showCustomRange = signal(false);
  readonly myForm = new FormGroup(
    {
      period:   new FormControl<string | null>(null),
      dateFrom: new FormControl<Date | null>(null),
      dateTo:   new FormControl<Date | null>(null),
    },
    { validators: customRangeValidator },
  );

  readonly periodOptions: SegmentedOption[] = [
    { value: '3_MONTHS', label: '3 חודשים' },
    { value: '6_MONTHS', label: 'חצי שנה' },
    { value: 'YEAR',     label: 'שנה' },
    { value: 'CUSTOM',   label: 'אחר' },
  ];

  private readonly period = toSignal(
    this.myForm.controls.period.valueChanges,
    { initialValue: '3_MONTHS' },
  );

  constructor() {
    effect(() => {
      const period = this.period();
  
      if (period === 'CUSTOM') {
        this.showCustomRange.set(true);
        return;
      }
  
      this.showCustomRange.set(false);
      this.myForm.patchValue(calculatePeriodRange(period), { emitEvent: false });
    });
  }
  
  closeCustomRange(): void {
    this.showCustomRange.set(false);
  }
}
