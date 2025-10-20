import { Pipe, PipeTransform } from '@angular/core';
import { ISelectItem } from '../shared/interface';

@Pipe({
    name: 'dateFormat',
    standalone: true
})
export class DateFormatPipe implements PipeTransform {

  transform(value: string | number | boolean | Date | ISelectItem | File): string {
    if (!value) return "";

    // Handle non-date-like values gracefully
    // if (typeof value === 'boolean' || value instanceof File) return String(value);

    // If value is from a select item, try to format its value recursively
    if (typeof value === 'object' && 'value' in (value as any) && 'name' in (value as any)) {
      return this.transform((value as unknown as ISelectItem).value as any);
    }

    // Normalize input to a safe date components without timezone drift
    let y: number, m: number, d: number;

    const strVal = String(value);

    // Case 1: Plain date string 'YYYY-MM-DD' (avoid timezone issues by manual parse)
    const plainDateMatch = strVal.match(/^\d{4}-\d{2}-\d{2}$/);
    if (plainDateMatch) {
      const [year, month, day] = strVal.split('-');
      y = Number(year);
      m = Number(month);
      d = Number(day);
    } else {
      // Case 2: ISO datetime or other date formats -> use Date
      const date = new Date(strVal);
      if (isNaN(date.getTime())) {
        // Case 3: numeric timestamp
        const asNum = typeof value === 'number' ? value : Number(value);
        if (!isNaN(asNum)) {
          const dateFromNum = new Date(asNum);
          if (!isNaN(dateFromNum.getTime())) {
            y = dateFromNum.getFullYear();
            m = dateFromNum.getMonth() + 1;
            d = dateFromNum.getDate();
          }
        }
      } else {
        y = date.getFullYear();
        m = date.getMonth() + 1;
        d = date.getDate();
      }
    }

    if (y === undefined || m === undefined || d === undefined) {
      return strVal; // fallback to original if parsing failed
    }

    const dd = String(d).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const yyyy = String(y);
    return `${dd}/${mm}/${yyyy}`;
  }

}
