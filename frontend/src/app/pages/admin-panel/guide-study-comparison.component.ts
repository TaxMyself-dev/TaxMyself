import { Component } from '@angular/core';
import { compareStudyFund, StudyInput } from './guide-study-comparison';

@Component({ selector: 'app-guide-study-comparison', standalone: true,
  templateUrl: './guide-study-comparison.component.html', styleUrls: ['./guide-study-comparison.component.scss'] })
export class GuideStudyComparisonComponent {
  values: StudyInput = { deposit: 10000, rate: 31, years: 6, growth: 5, income: 250000 };
  details = false;
  readonly fields = [
    { key: 'deposit' as const, label: 'הפקדה שנתית', min: 0, max: 100000, step: 100 },
    { key: 'rate' as const, label: 'מס שולי', min: 0, max: 47, step: 1 },
    { key: 'years' as const, label: 'שנות חיסכון', min: 6, max: 30, step: 1 },
    { key: 'growth' as const, label: 'תשואה שנתית משוערת', min: 0, max: 10, step: .5 },
  ];
  get result() { return compareStudyFund(this.values); }
  money(n: number) { return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n) + ' ₪'; }
  display(key: keyof StudyInput) { return key === 'deposit' ? this.money(this.values[key]) : this.values[key] + (key === 'rate' || key === 'growth' ? '%' : ''); }
  change(key: keyof StudyInput, event: Event) {
    const n = Number((event.target as HTMLInputElement).value);
    const field = this.fields.find(f => f.key === key);
    this.values = { ...this.values, [key]: Number.isFinite(n) ? Math.max(field?.min ?? 0, Math.min(field?.max ?? 1000000, n)) : 0 };
  }
}
