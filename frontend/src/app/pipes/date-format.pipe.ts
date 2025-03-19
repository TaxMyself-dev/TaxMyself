import { Pipe, PipeTransform } from '@angular/core';
import { ISelectItem } from '../shared/interface';

@Pipe({
    name: 'dateFormat',
    standalone: false
})
export class DateFormatPipe implements PipeTransform {

  transform(value: string| number | boolean | Date | ISelectItem | File): string  {
    
    if (!value) return "";
    
    const [year, month, day] = String(value).split('-');
    return `${day}/${month}/${year}`;
  }

}
