
// import {
//   Component,
//   computed,
//   effect,
//   ElementRef,
//   HostListener,
//   input,
//   output,
//   signal,
//   viewChild,
// } from '@angular/core';
// import { FormControl, ReactiveFormsModule } from '@angular/forms';
// import { DatePickerModule } from 'primeng/datepicker';
// import { ButtonModule } from 'primeng/button';
// import { FormsModule } from '@angular/forms';

// @Component({
//   selector: 'app-custom-date-range',
//   templateUrl: './custom-date-range.component.html',
//   styleUrls: ['./custom-date-range.component.scss'],
//   imports: [ReactiveFormsModule, FormsModule, DatePickerModule, ButtonModule],
// })
// export class CustomDateRangeComponent {
//   readonly startControl = input.required<FormControl<Date | null>>();
//   readonly endControl = input.required<FormControl<Date | null>>();

//   readonly closed = output<void>();

//   private readonly host = viewChild.required<ElementRef<HTMLElement>>('popoverRoot');

//   readonly today = this.startOfDay(new Date());
//   readonly minStartDate = this.startOfDay(
//     new Date(this.today.getFullYear() - 1, this.today.getMonth(), this.today.getDate()),
//   );

//   readonly rangeDates = signal<Date[] | null>(null);

//   readonly startDate = computed(() => this.rangeDates()?.[0] ?? null);
//   readonly endDate = computed(() => this.rangeDates()?.[1] ?? null);

//   readonly formattedStart = computed(() => this.formatDate(this.startDate()));
//   readonly formattedEnd = computed(() => this.formatDate(this.endDate()));

//   readonly validationMessage = computed(() => {
//     const start = this.startDate();
//     const end = this.endDate();

//     if (!start || !end) return 'יש לבחור תאריך התחלה ותאריך סוף';

//     if (end <= start) return 'תאריך הסוף חייב להיות אחרי תאריך ההתחלה';

//     if (!this.isValidRange(start, end)) {
//       return 'טווח התאריכים חייב להיות לפחות שלושה חודשים';
//     }

//     return null;
//   });

//   readonly canChoose = computed(() => !this.validationMessage());

//   constructor() {
//     effect(() => {
//       const start = this.startControl().value;
//       const end = this.endControl().value;

//       if (start && end) {
//         this.rangeDates.set([this.startOfDay(start), this.startOfDay(end)]);
//       }
//     });
//   }

//   onRangeChange(value: Date[] | null): void {
//     this.rangeDates.set(value);

//     const start = value?.[0] ? this.startOfDay(value[0]) : null;
//     const end = value?.[1] ? this.startOfDay(value[1]) : null;

//     this.startControl().setValue(start);
//     this.endControl().setValue(end);

//     this.startControl().markAsTouched();
//     this.endControl().markAsTouched();
//   }

//   choose(): void {
//     const start = this.startDate();
//     const end = this.endDate();

//     if (!start || !end || !this.isValidRange(start, end)) return;

//     this.startControl().setValue(start);
//     this.endControl().setValue(end);
//     this.closed.emit();
//   }

//   clear(): void {
//     this.rangeDates.set(null);
//     this.startControl().setValue(null);
//     this.endControl().setValue(null);
//   }

//   isInSelectedRange(dateMeta: { year: number; month: number; day: number }): boolean {
//     const start = this.startDate();
//     const end = this.endDate();

//     if (!start || !end) return false;

//     const current = new Date(dateMeta.year, dateMeta.month, dateMeta.day);
//     return current >= start && current <= end;
//   }

//   private isValidRange(start: Date, end: Date): boolean {
//     if (end <= start) return false;

//     // Exception:
//     // If end date is today, allow start from the first day of the month two months ago.
//     if (this.isSameDate(end, this.today)) {
//       const allowedStart = new Date(this.today.getFullYear(), this.today.getMonth() - 2, 1);
//       return start <= allowedStart;
//     }

//     const minEnd = new Date(start.getFullYear(), start.getMonth() + 3, start.getDate());
//     return end >= minEnd;
//   }

//   private startOfDay(date: Date): Date {
//     const d = new Date(date);
//     d.setHours(0, 0, 0, 0);
//     return d;
//   }

//   private isSameDate(a: Date, b: Date): boolean {
//     return (
//       a.getFullYear() === b.getFullYear() &&
//       a.getMonth() === b.getMonth() &&
//       a.getDate() === b.getDate()
//     );
//   }

//   private formatDate(date: Date | null): string {
//     if (!date) return 'לא נבחר';

//     return date.toLocaleDateString('he-IL', {
//       day: '2-digit',
//       month: '2-digit',
//       year: 'numeric',
//     });
//   }

//   @HostListener('document:mousedown', ['$event'])
//   onDocumentMouseDown(event: MouseEvent): void {
//     const root = this.host()?.nativeElement;
//     if (!root) return;

//     if (!root.contains(event.target as Node)) {
//       this.closed.emit();
//     }
//   }
// }



import {
  Component,
  computed,
  ElementRef,
  HostListener,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { ButtonComponent } from "src/app/components/button/button.component";
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';

@Component({
  selector: 'app-custom-date-range',
  templateUrl: './custom-date-range.component.html',
  styleUrls: ['./custom-date-range.component.scss'],
  imports: [ReactiveFormsModule, FormsModule, DatePickerModule, ButtonModule, ButtonComponent],
})
export class CustomDateRangeComponent {

  readonly buttonColor = ButtonColor;
  readonly buttonSize = ButtonSize;
  readonly startControl = input.required<FormControl<Date | null>>();
  readonly endControl = input.required<FormControl<Date | null>>();

  readonly closed = output<void>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('popoverRoot');

  readonly today = this.startOfDay(new Date());

  readonly minStartDate = this.startOfDay(
    new Date(this.today.getFullYear() - 1, this.today.getMonth(), this.today.getDate()),
  );

  readonly startDate = signal<Date | null>(null);
  readonly endDate = signal<Date | null>(null);

  readonly formattedStart = computed(() => this.formatDate(this.startDate()));
  readonly formattedEnd = computed(() => this.formatDate(this.endDate()));

  readonly validationMessage = computed(() => {
    const start = this.startDate();
    const end = this.endDate();

    if (!start || !end) return 'יש לבחור תאריך התחלה ותאריך סוף';

    if (end <= start) return 'תאריך הסוף חייב להיות אחרי תאריך ההתחלה';

    if (!this.isValidRange(start, end)) {
      return 'טווח התאריכים חייב להיות לפחות שלושה חודשים';
    }

    return null;
  });

  readonly canChoose = computed(() => !this.validationMessage());

  constructor() {
    queueMicrotask(() => {
      const start = this.startControl().value;
      const end = this.endControl().value;

      if (start) this.startDate.set(this.startOfDay(start));
      if (end) this.endDate.set(this.startOfDay(end));
    });
  }

  onStartDateChange(date: Date): void {
    const start = this.startOfDay(date);

    this.startDate.set(start);
    this.startControl().setValue(start);
    this.startControl().markAsTouched();

    const end = this.endDate();

    if (end && end <= start) {
      this.endDate.set(null);
      this.endControl().setValue(null);
    }
  }

  onEndDateChange(date: Date): void {
    const end = this.startOfDay(date);

    this.endDate.set(end);
    this.endControl().setValue(end);
    this.endControl().markAsTouched();
  }

  choose(): void {
    const start = this.startDate();
    const end = this.endDate();

    if (!start || !end || !this.isValidRange(start, end)) return;

    this.startControl().setValue(start);
    this.endControl().setValue(end);

    this.closed.emit();
  }

  clear(): void {
    this.startDate.set(null);
    this.endDate.set(null);

    this.startControl().setValue(null);
    this.endControl().setValue(null);
  }

  isInSelectedRange(dateMeta: { year: number; month: number; day: number }): boolean {
    const start = this.startDate();
    const end = this.endDate();

    if (!start || !end) return false;

    const current = this.startOfDay(new Date(dateMeta.year, dateMeta.month, dateMeta.day));
    return current >= start && current <= end;
  }

  isStartDate(dateMeta: { year: number; month: number; day: number }): boolean {
    const start = this.startDate();
    if (!start) return false;

    const current = new Date(dateMeta.year, dateMeta.month, dateMeta.day);
    return this.isSameDate(current, start);
  }

  isEndDate(dateMeta: { year: number; month: number; day: number }): boolean {
    const end = this.endDate();
    if (!end) return false;

    const current = new Date(dateMeta.year, dateMeta.month, dateMeta.day);
    return this.isSameDate(current, end);
  }

  private isValidRange(start: Date, end: Date): boolean {
    if (end <= start) return false;

    // חריג:
    // אם תאריך הסוף הוא היום, מספיק לבחור מהיום אחורה שני חודשים מלאים.
    // לדוגמה: אם היום 30/04, מותר להתחיל מ־01/02.
    if (this.isSameDate(end, this.today)) {
      const allowedStart = new Date(this.today.getFullYear(), this.today.getMonth() - 2, 1);
      return start <= allowedStart;
    }

    const minEnd = new Date(start.getFullYear(), start.getMonth() + 3, start.getDate());
    return end >= minEnd;
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private isSameDate(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private formatDate(date: Date | null): string {
    // if (!date) return 'לא נבחר';
    if (!date) return '';

    return date.toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    const root = this.host()?.nativeElement;
    if (!root) return;

    if (!root.contains(event.target as Node)) {
      this.closed.emit();
    }
  }
}