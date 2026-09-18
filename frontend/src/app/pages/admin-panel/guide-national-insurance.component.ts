import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { boundedNumber, calculateGuideInsurance, NI_2026 } from './guide-national-insurance';

@Component({
  selector: 'app-guide-national-insurance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './guide-national-insurance.component.html',
  styleUrls: ['./guide-national-insurance.component.scss'],
})
export class GuideNationalInsuranceComponent {
  readonly figures = NI_2026;
  profit = 2000;
  salary = 10000;
  hours = 8;
  get result() { return calculateGuideInsurance(this.profit, this.salary, this.hours); }
  setValue(field: 'profit' | 'salary' | 'hours', event: Event): void {
    this[field] = boundedNumber((event.target as HTMLInputElement).value, field === 'hours' ? 80 : 100000);
  }
  money(value: number): string { return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value); }
  percent(value: number): string { return new Intl.NumberFormat('he-IL', { style: 'percent', maximumFractionDigits: 2 }).format(value); }
}
